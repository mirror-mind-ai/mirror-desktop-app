import { type ClientRequestBody, type HostEvent, type HostIdentity, type HostResultBody, PROTOCOL_VERSION } from "@mirror-desktop/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConversations } from "../conversations/store.ts";
import { useJourneys } from "../journeys/store.ts";
import { resetAllStores } from "../stores/registry.ts";
import { ConnectionLostError, type HostConnection, HostRequestError } from "./client.ts";
import { type ConnectionLease, connectToHost } from "./connect.ts";
import { signedIn, tryHostAgain, useHost } from "./store.ts";

const identity: HostIdentity = { instanceId: "host-1", protocolVersion: PROTOCOL_VERSION, node: "v24.0.0", pi: "0.0.0", mirror: "0.0.0" };

/** A connection answering models.available and journeys.list as told, recording what it was asked and whether it was closed. */
function stubHost(answers: Partial<Record<ClientRequestBody["type"], () => Promise<HostResultBody>>>) {
  const requests: ClientRequestBody["type"][] = [];
  const state = { closed: false };
  const client: HostConnection = {
    onEvent: () => {},
    onClose: () => {},
    close: () => {
      state.closed = true;
    },
    request: (body) => {
      requests.push(body.type);
      const answer = answers[body.type];
      return answer ? answer() : Promise.reject(new Error(`the stub host does not answer ${body.type}`));
    },
  };
  return { client, requests, state };
}

const healthy = () =>
  stubHost({
    "models.available": async () => ({ type: "models.available", models: [{ provider: "anthropic", id: "claude-test", name: "Claude Test", reasoning: true }] }),
    "journeys.list": async () => ({ type: "journeys.list", journeys: [] }),
  });

const lease = (): ConnectionLease => ({ cancelled: false, client: null });

beforeEach(() => resetAllStores());

describe("connecting to the host", () => {
  it("starts out connecting, on the first attempt", () => {
    expect(useHost.getState()).toMatchObject({ status: "connecting", client: null, identity: null, failure: null, attempt: 0 });
  });

  it("says hello, learns whether a model can be used, then lists the Journeys", async () => {
    const { client, requests } = healthy();
    const held = lease();
    await connectToHost(async () => ({ client, host: identity }), held);
    expect(useHost.getState()).toMatchObject({ status: "ready", client, identity, canUseModels: true, failure: null });
    expect(useJourneys.getState()).toEqual({ status: "loaded", journeys: [] });
    expect(requests).toEqual(["models.available", "journeys.list"]);
    expect(held.client).toBe(client);
  });

  it("knows when no model can be used", async () => {
    const { client } = stubHost({
      "models.available": async () => ({ type: "models.available", models: [] }),
      "journeys.list": async () => ({ type: "journeys.list", journeys: [] }),
    });
    await connectToHost(async () => ({ client, host: identity }), lease());
    expect(useHost.getState()).toMatchObject({ status: "ready", canUseModels: false });
    signedIn();
    expect(useHost.getState().canUseModels).toBe(true);
  });

  it("hands the host's events to the conversations", async () => {
    const { client } = healthy();
    await connectToHost(async () => ({ client, host: identity }), lease());
    useConversations.setState({
      current: "garden",
      entries: { garden: { status: "open", draft: "", rows: [], running: true, session: { id: "session-1", cwd: "/Users/test/garden", thinkingLevel: "medium" } } },
    });
    const settled: HostEvent = { type: "session.event", sessionId: "session-1", at: 0, event: { type: "agent_settled", aborted: false } };
    client.onEvent(settled);
    expect(useConversations.getState().entries["garden"]?.running).toBe(false);
  });

  it("fails the host, by the host's words, when the connection or hello fails", async () => {
    await connectToHost(async () => {
      throw new HostRequestError("unauthorized", "The host did not recognize this token.");
    }, lease());
    expect(useHost.getState()).toMatchObject({ status: "failed", client: null, failure: "The host did not recognize this token." });
    expect(useJourneys.getState()).toEqual({ status: "loading" });
  });

  it("fails the host when it cannot say which models can be used", async () => {
    const { client, requests } = stubHost({
      "models.available": async () => {
        throw new HostRequestError("internal_failure", "The host could not complete the request.");
      },
    });
    await connectToHost(async () => ({ client, host: identity }), lease());
    expect(useHost.getState()).toMatchObject({ status: "failed", failure: "The host could not complete the request." });
    expect(requests).toEqual(["models.available"]);
  });

  it("fails only the Journeys when the list fails: the host is still there", async () => {
    const { client } = stubHost({
      "models.available": async () => ({ type: "models.available", models: [] }),
      "journeys.list": async () => {
        throw new HostRequestError("mirror_not_configured", "No Mirror home is configured on this machine yet.");
      },
    });
    await connectToHost(async () => ({ client, host: identity }), lease());
    expect(useHost.getState().status).toBe("ready");
    expect(useJourneys.getState()).toMatchObject({ status: "failed", code: "mirror_not_configured" });
  });

  it("closes a connection that opened after its lease was given up, and writes nothing", async () => {
    const { client, requests, state } = healthy();
    const held = lease();
    held.cancelled = true;
    await connectToHost(async () => ({ client, host: identity }), held);
    expect(state.closed).toBe(true);
    expect(requests).toEqual([]);
    expect(useHost.getState()).toMatchObject({ status: "connecting", client: null });
  });

  it("stops writing once the lease is given up mid-way", async () => {
    let answerModels: (result: HostResultBody) => void = () => {};
    const { client, requests } = stubHost({
      "models.available": () => new Promise((resolve) => (answerModels = resolve)),
    });
    const held = lease();
    const connecting = connectToHost(async () => ({ client, host: identity }), held);
    await vi.waitFor(() => expect(useHost.getState().status).toBe("connected"));
    held.cancelled = true;
    answerModels({ type: "models.available", models: [] });
    await connecting;
    expect(useHost.getState().status).toBe("connected");
    expect(requests).toEqual(["models.available"]);
  });

  it("reports a connection lost after the host was ready, and settles the conversations", async () => {
    const { client } = healthy();
    await connectToHost(async () => ({ client, host: identity }), lease());
    useConversations.setState({ entries: { garden: { status: "open", draft: "", rows: [], running: true, session: { id: "session-1", cwd: "/Users/test/garden", thinkingLevel: "medium" } } } });

    client.onClose(new ConnectionLostError(false, 1006, ""));
    expect(useHost.getState()).toMatchObject({ status: "failed", client: null, failure: "The connection to the host was lost.", lostAfterReady: true });
    expect(useConversations.getState().entries["garden"]?.running).toBe(false);
  });

  it("reports nothing for a close after the lease was given up", async () => {
    const { client } = healthy();
    const held = lease();
    await connectToHost(async () => ({ client, host: identity }), held);
    held.cancelled = true;
    client.onClose(new ConnectionLostError(true, 1000, ""));
    expect(useHost.getState().status).toBe("ready");
  });

  it("leaves a close before ready to the request it fails: one report, not two", async () => {
    let failModels: (error: Error) => void = () => {};
    const { client } = stubHost({
      "models.available": () => new Promise((_resolve, reject) => (failModels = reject)),
    });
    const connecting = connectToHost(async () => ({ client, host: identity }), lease());
    await vi.waitFor(() => expect(useHost.getState().status).toBe("connected"));
    const lost = new ConnectionLostError(false, 1006, "");
    client.onClose(lost);
    expect(useHost.getState().status).toBe("connected");
    failModels(lost);
    await connecting;
    expect(useHost.getState()).toMatchObject({ status: "failed", failure: "The connection to the host was lost.", lostAfterReady: false });
  });

  it("starts again from connecting on Try again, with the attempt counted", async () => {
    await connectToHost(async () => {
      throw new Error("The host did not accept the connection.");
    }, lease());
    tryHostAgain();
    expect(useHost.getState()).toMatchObject({ status: "connecting", client: null, failure: null, attempt: 1 });
  });
});
