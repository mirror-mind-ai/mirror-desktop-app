import { PROTOCOL_VERSION } from "@mirror-desktop/protocol";
import { describe, expect, it, vi } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { listen, type ServerSide, type SocketPeer } from "../testing/fakeSocket.ts";
import { ConnectionLostError, failureOf, HostClient } from "./client.ts";

const world = {
  models: [],
  journeys: [{ id: "garden", name: "Garden", status: "active", description: "", projectPath: "/Users/test/garden" }],
  turns: [],
} as const;

/** A host that answers hello and then closes cleanly on the next request, as a host shutting down would. */
function hostThatSaysGoodbye(endpoint: { port: number; token: string }) {
  listen(`ws://127.0.0.1:${endpoint.port}`, {
    accept(side: ServerSide): SocketPeer {
      return {
        receive(frame) {
          const { id, request } = JSON.parse(frame) as { id: string; request: { type: string } };
          if (request.type === "hello") {
            side.send(
              JSON.stringify({
                id,
                result: { type: "hello", host: { instanceId: "h", protocolVersion: PROTOCOL_VERSION, node: "v24", pi: "0", mirror: "0" } },
              }),
            );
          } else {
            side.close(1001, "going away");
          }
        },
        closed() {},
      };
    },
  });
}

describe("the host's door and a connection that ends", () => {
  it("rejects what waits on a dropped connection by name, and says the connection was lost", async () => {
    const host = serveFakeHost({ ...world, heldOpens: ["garden"] });
    const { client } = await HostClient.connect(host.endpoint);
    const closes: ConnectionLostError[] = [];
    client.onClose = (lost) => closes.push(lost);

    const pending = client.request({ type: "session.open", journey: "garden" });
    await vi.waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));
    host.goAway();

    const error = await pending.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConnectionLostError);
    expect(error).toMatchObject({ code: "connection_lost", wasClean: false, closeCode: 1006, message: "The connection to the host was lost." });
    expect(failureOf(error)).toEqual({ code: "connection_lost", message: "The connection to the host was lost." });
    expect(closes).toHaveLength(1);
    expect(closes[0]).toBe(error);

    // Nothing waits any more: a request after the close fails at once, the same way.
    await expect(client.request({ type: "journeys.list" })).rejects.toMatchObject({ code: "connection_lost" });
  });

  it("words a clean close by the host with its code and reason", async () => {
    const endpoint = { port: 7, token: "t" };
    hostThatSaysGoodbye(endpoint);
    const { client } = await HostClient.connect(endpoint);
    const closes: ConnectionLostError[] = [];
    client.onClose = (lost) => closes.push(lost);

    const error = await client.request({ type: "journeys.list" }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: "connection_lost",
      wasClean: true,
      closeCode: 1001,
      reason: "going away",
      message: "The host closed the connection (1001 going away).",
    });
    expect(closes).toHaveLength(1);
  });

  it("reports nothing for a close the UI asked for, though what waited on it still fails", async () => {
    const host = serveFakeHost({ ...world, heldOpens: ["garden"] });
    const { client } = await HostClient.connect(host.endpoint);
    const closes: ConnectionLostError[] = [];
    client.onClose = (lost) => closes.push(lost);
    const pending = client.request({ type: "session.open", journey: "garden" });
    await vi.waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));

    client.close();
    await expect(pending).rejects.toMatchObject({ code: "connection_lost", wasClean: true, closeCode: 1000 });
    expect(closes).toEqual([]);
    host.heldOpen("garden").release();
  });
});
