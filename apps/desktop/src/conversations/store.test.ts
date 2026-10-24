import type { ClientRequestBody, HostEvent, HostResultBody, SessionEvent } from "@mirror-desktop/protocol";
import { beforeEach, describe, expect, it } from "vitest";

import { type HostConnection, HostRequestError } from "../host/client.ts";
import { resetAllStores } from "../stores/registry.ts";
import {
  abort,
  applyHostEvent,
  type Conversation,
  isWorking,
  selectJourney,
  send,
  setDraft,
  useConversations,
} from "./store.ts";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** A connection whose answers the test writes: each request waits on what `answer` returns for it. */
function stubHost(answer: (body: ClientRequestBody) => Promise<HostResultBody>) {
  const requests: ClientRequestBody[] = [];
  const client: HostConnection = {
    onEvent: () => {},
    close: () => {},
    request: (body) => {
      requests.push(body);
      return answer(body);
    },
  };
  return { client, requests };
}

const opened = (sessionId: string, journey: string, extra: Partial<Extract<HostResultBody, { type: "session.open" }>> = {}): HostResultBody => ({
  type: "session.open",
  sessionId,
  sessionFile: `/Users/test/.pi/agent/sessions/${sessionId}.jsonl`,
  cwd: `/Users/test/${journey}`,
  journey,
  model: { provider: "anthropic", id: "claude-test" },
  thinkingLevel: "medium",
  diagnostics: [],
  ...extra,
});

/** A host that opens every Journey at once, as session-1, session-2…, and accepts every prompt and abort. */
function openingHost() {
  let sessions = 0;
  return stubHost(async (body) => {
    switch (body.type) {
      case "session.open":
        sessions += 1;
        return opened(`session-${sessions}`, body.journey ?? "?");
      case "session.prompt":
        return { type: "session.prompt", sessionId: body.sessionId };
      case "session.abort":
        return { type: "session.abort", sessionId: body.sessionId };
      default:
        throw new Error(`the stub host does not answer ${body.type}`);
    }
  });
}

const entry = (journeyId: string): Conversation | undefined => useConversations.getState().entries[journeyId];
const event = (sessionId: string, sessionEvent: SessionEvent): HostEvent => ({ type: "session.event", sessionId, at: 0, event: sessionEvent });

/** Pick `journeyId`, type `text`, send it, and wait until the host accepted the prompt. */
async function sendInto(client: HostConnection, journeyId: string, text: string): Promise<void> {
  selectJourney(journeyId);
  setDraft(journeyId, text);
  await send(client, journeyId);
}

beforeEach(() => resetAllStores());

describe("selecting a Journey", () => {
  it("makes it current with an empty conversation, and asks the host for nothing", () => {
    selectJourney("garden");
    expect(useConversations.getState().current).toBe("garden");
    expect(entry("garden")).toEqual({ status: "idle", draft: "", rows: [], running: false });
  });

  it("keeps each Journey's draft and conversation when switching between them", () => {
    selectJourney("garden");
    setDraft("garden", "Water the beds");
    selectJourney("beds");
    setDraft("beds", "Plant");
    selectJourney("garden");
    expect(useConversations.getState().current).toBe("garden");
    expect(entry("garden")?.draft).toBe("Water the beds");
    expect(entry("beds")?.draft).toBe("Plant");
  });
});

describe("sending", () => {
  it("opens the Journey's session on the first send, then prompts it, showing the message at once", async () => {
    const open = deferred<HostResultBody>();
    const { client, requests } = stubHost((body) =>
      body.type === "session.open" ? open.promise : Promise.resolve({ type: "session.prompt", sessionId: "session-1" }),
    );
    selectJourney("garden");
    setDraft("garden", "  Hello  ");
    const sending = send(client, "garden");

    expect(entry("garden")).toMatchObject({ status: "opening", draft: "", rows: [{ kind: "user", text: "Hello" }], running: false });
    expect(isWorking(entry("garden"))).toBe(true);
    expect(requests).toEqual([{ type: "session.open", journey: "garden" }]);

    open.resolve(opened("session-1", "garden", { cwd: "/Users/test/gardens/garden" }));
    await sending;
    expect(entry("garden")).toMatchObject({
      status: "open",
      running: true,
      session: { id: "session-1", cwd: "/Users/test/gardens/garden", model: "anthropic/claude-test", thinkingLevel: "medium" },
    });
    expect(requests).toEqual([
      { type: "session.open", journey: "garden" },
      { type: "session.prompt", sessionId: "session-1", text: "Hello" },
    ]);
  });

  it("sends nothing for an empty draft", async () => {
    const { client, requests } = openingHost();
    await sendInto(client, "garden", "   ");
    expect(requests).toEqual([]);
    expect(entry("garden")?.status).toBe("idle");
  });

  it("opens once: a send while the session opens is refused and keeps its draft, and later sends reuse the session", async () => {
    const open = deferred<HostResultBody>();
    const { client, requests } = stubHost((body) =>
      body.type === "session.open" ? open.promise : Promise.resolve({ type: "session.prompt", sessionId: "session-1" }),
    );
    selectJourney("garden");
    setDraft("garden", "Hello");
    const first = send(client, "garden");
    setDraft("garden", "Again");
    await send(client, "garden");
    expect(entry("garden")?.draft).toBe("Again");
    expect(requests.filter((request) => request.type === "session.open")).toHaveLength(1);

    open.resolve(opened("session-1", "garden"));
    await first;
    applyHostEvent(event("session-1", { type: "agent_settled", aborted: false }));
    await send(client, "garden");
    expect(requests.map((request) => request.type)).toEqual(["session.open", "session.prompt", "session.prompt"]);
  });

  it("refuses a send while the Journey's turn is running", async () => {
    const { client, requests } = openingHost();
    await sendInto(client, "garden", "Hello");
    setDraft("garden", "Again");
    await send(client, "garden");
    expect(requests.map((request) => request.type)).toEqual(["session.open", "session.prompt"]);
    expect(entry("garden")?.draft).toBe("Again");
  });

  it("shows what failed to load when the session opened before the message, as diagnostic rows", async () => {
    const { client } = stubHost(async (body) =>
      body.type === "session.open"
        ? opened("session-1", "garden", { diagnostics: ["mirror: could not bind the session"] })
        : { type: "session.prompt", sessionId: "session-1" },
    );
    await sendInto(client, "garden", "Hello");
    expect(entry("garden")?.rows).toEqual([
      { kind: "diagnostic", text: "mirror: could not bind the session" },
      { kind: "user", text: "Hello" },
    ]);
  });

  it("names a failed open, takes the message back into the draft, and opens again on the next send", async () => {
    let attempts = 0;
    const { client, requests } = stubHost(async (body) => {
      if (body.type === "session.open") {
        attempts += 1;
        if (attempts === 1) throw new HostRequestError("session_open_failed", "The project path does not exist.");
        return opened("session-1", "garden");
      }
      return { type: "session.prompt", sessionId: "session-1" };
    });
    await sendInto(client, "garden", "Hello");
    expect(entry("garden")).toEqual({
      status: "failed",
      draft: "Hello",
      rows: [],
      running: false,
      failure: "The project path does not exist.",
    });
    expect(isWorking(entry("garden"))).toBe(false);

    await send(client, "garden");
    expect(entry("garden")).toMatchObject({ status: "open", running: true, draft: "", rows: [{ kind: "user", text: "Hello" }] });
    expect(entry("garden")?.failure).toBeUndefined();
    expect(requests.map((request) => request.type)).toEqual(["session.open", "session.open", "session.prompt"]);
  });

  it("rolls back a prompt the host refused, and rejects so the composer can say why", async () => {
    const { client } = stubHost(async (body) => {
      if (body.type === "session.open") return opened("session-1", "garden");
      throw new HostRequestError("session_busy", "The session is still answering.");
    });
    selectJourney("garden");
    setDraft("garden", "Hello");
    await expect(send(client, "garden")).rejects.toThrow("The session is still answering.");
    expect(entry("garden")).toMatchObject({ status: "open", running: false, rows: [], draft: "Hello" });
  });

  it("keeps a new draft typed while the open was failing, rather than overwrite it", async () => {
    const open = deferred<HostResultBody>();
    const { client } = stubHost(() => open.promise);
    selectJourney("garden");
    setDraft("garden", "Hello");
    const sending = send(client, "garden");
    setDraft("garden", "Something else");
    open.reject(new HostRequestError("session_open_failed", "No."));
    await sending;
    expect(entry("garden")?.draft).toBe("Something else");
  });

  it("lets two Journeys open at once, each with its own state", async () => {
    const opens = new Map<string, Deferred<HostResultBody>>();
    const { client } = stubHost((body) => {
      if (body.type === "session.open") {
        const pending = deferred<HostResultBody>();
        opens.set(body.journey ?? "?", pending);
        return pending.promise;
      }
      return Promise.resolve({ type: "session.prompt", sessionId: body.type === "session.prompt" ? body.sessionId : "?" });
    });
    selectJourney("garden");
    setDraft("garden", "Hello");
    const garden = send(client, "garden");
    selectJourney("beds");
    setDraft("beds", "Plant");
    const beds = send(client, "beds");

    opens.get("beds")?.resolve(opened("session-2", "beds"));
    await beds;
    expect(entry("beds")).toMatchObject({ status: "open", running: true });
    expect(entry("garden")?.status).toBe("opening");

    opens.get("garden")?.resolve(opened("session-1", "garden"));
    await garden;
    expect(entry("garden")).toMatchObject({ status: "open", running: true, session: { id: "session-1" } });
    expect(useConversations.getState().current).toBe("beds");
  });
});

describe("host events", () => {
  it("routes each session's events to its own conversation, and settles only that one", async () => {
    const { client } = openingHost();
    await sendInto(client, "garden", "Hello");
    await sendInto(client, "beds", "Plant");

    applyHostEvent(event("session-2", { type: "text_delta", delta: "Seeds." }));
    applyHostEvent(event("session-1", { type: "agent_settled", aborted: false }));

    expect(entry("beds")?.rows).toEqual([
      { kind: "user", text: "Plant" },
      { kind: "assistant", text: "Seeds.", thinking: "", done: false },
    ]);
    expect(entry("garden")?.rows).toEqual([{ kind: "user", text: "Hello" }]);
    expect(entry("garden")?.running).toBe(false);
    expect(entry("beds")?.running).toBe(true);
  });

  it("drops an event for a session no conversation knows", async () => {
    const { client } = openingHost();
    await sendInto(client, "garden", "Hello");
    const before = useConversations.getState();
    applyHostEvent(event("session-9", { type: "text_delta", delta: "Lost." }));
    applyHostEvent({ type: "session.extension_error", sessionId: "session-9", extension: "x", event: "y", message: "z" });
    expect(useConversations.getState()).toBe(before);
  });

  it("shows an extension's failure in the conversation of its session", async () => {
    const { client } = openingHost();
    await sendInto(client, "garden", "Hello");
    applyHostEvent({ type: "session.extension_error", sessionId: "session-1", extension: "mirror", event: "agent_end", message: "the database is locked" });
    expect(entry("garden")?.rows.at(-1)).toEqual({
      kind: "notice",
      name: "Extension failed",
      tone: "notice",
      text: "mirror on agent_end: the database is locked",
    });
  });

  it("ignores events that belong to no conversation, such as a sign-in flow's", () => {
    selectJourney("garden");
    const before = useConversations.getState();
    applyHostEvent({ type: "auth.prompt_closed", promptId: "p1" });
    applyHostEvent({ type: "host.ready" });
    expect(useConversations.getState()).toBe(before);
  });
});

describe("stopping", () => {
  it("asks the host to stop the session of that Journey, only while its turn runs", async () => {
    const { client, requests } = openingHost();
    await sendInto(client, "garden", "Hello");
    await sendInto(client, "beds", "Plant");
    applyHostEvent(event("session-2", { type: "agent_settled", aborted: false }));

    await abort(client, "beds");
    await abort(client, "garden");
    await abort(client, "attic");
    expect(requests.filter((request) => request.type === "session.abort")).toEqual([
      { type: "session.abort", sessionId: "session-1" },
    ]);
  });

  it("does not throw when the host refuses to stop", async () => {
    const { client } = stubHost(async (body) => {
      if (body.type === "session.open") return opened("session-1", "garden");
      if (body.type === "session.prompt") return { type: "session.prompt", sessionId: "session-1" };
      throw new HostRequestError("session_not_found", "No open session session-1.");
    });
    await sendInto(client, "garden", "Hello");
    await expect(abort(client, "garden")).resolves.toBeUndefined();
  });
});

describe("isolation", () => {
  it("writes nothing from a send that was still waiting when the stores were reset", async () => {
    const open = deferred<HostResultBody>();
    const { client } = stubHost(() => open.promise);
    selectJourney("garden");
    setDraft("garden", "Hello");
    const sending = send(client, "garden");
    resetAllStores();
    open.resolve(opened("session-1", "garden"));
    await sending;
    expect(useConversations.getState()).toEqual({ current: null, entries: {} });
  });
});
