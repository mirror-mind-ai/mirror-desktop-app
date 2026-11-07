import type {
  AvailableModel,
  ClientRequestBody,
  HostEvent,
  HostResultBody,
  PromptDisposition,
  SessionEvent,
  SessionSummary,
  StreamingBehavior,
  TranscriptEntry,
} from "@mirror-desktop/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionLostError, type HostConnection, HostRequestError } from "../host/client.ts";
import { resetAllStores } from "../stores/registry.ts";
import { shownChoice } from "./headerChoice.ts";
import {
  abort,
  applyHostEvent,
  chooseModel,
  chooseSession,
  chooseThinking,
  connectionLost,
  type Conversation,
  isWorking,
  queueMessage,
  refreshSessions,
  retryRead,
  retrySessions,
  selectJourney,
  send,
  setDraft,
  showJourney,
  shownSummary,
  startNewSession,
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
    onClose: () => {},
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
        return { type: "session.prompt", sessionId: body.sessionId, disposition: "started" };
      case "session.abort":
        return { type: "session.abort", sessionId: body.sessionId, withdrawn: { steering: [], followUp: [] } };
      default:
        throw new Error(`the stub host does not answer ${body.type}`);
    }
  });
}

const entry = (journeyId: string): Conversation | undefined => useConversations.getState().entries[journeyId];

/** A conversation's live-control fields when nothing is queued, sending, awaited or running in Pi. */
const quiet = { queue: { steering: [], followUp: [] }, sending: [], awaitingEcho: false, piRunning: false };
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
    expect(entry("garden")).toEqual({ status: "idle", draft: "", rows: [], running: false, shown: { kind: "new" }, ...quiet });
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
      body.type === "session.open" ? open.promise : Promise.resolve({ type: "session.prompt", sessionId: "session-1", disposition: "started" }),
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
      session: { id: "session-1", cwd: "/Users/test/gardens/garden", model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "medium" },
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
      body.type === "session.open" ? open.promise : Promise.resolve({ type: "session.prompt", sessionId: "session-1", disposition: "started" }),
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
        : { type: "session.prompt", sessionId: "session-1", disposition: "started" },
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
      return { type: "session.prompt", sessionId: "session-1", disposition: "started" };
    });
    await sendInto(client, "garden", "Hello");
    expect(entry("garden")).toEqual({
      status: "failed",
      draft: "Hello",
      rows: [],
      running: false,
      failure: "The project path does not exist.",
      shown: { kind: "new" },
      ...quiet,
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

  it("rolls back a prompt the connection's loss refused, without rejecting: the shell says that one", async () => {
    const { client } = stubHost(async (body) => {
      if (body.type === "session.open") return opened("session-1", "garden");
      throw new ConnectionLostError(false, 1006, "");
    });
    selectJourney("garden");
    setDraft("garden", "Hello");
    await expect(send(client, "garden")).resolves.toBeUndefined();
    expect(entry("garden")).toMatchObject({ status: "open", running: false, rows: [], draft: "Hello" });
  });

  // D11: every return to the draft is terminal Pi's merge, which never discards.
  it("puts the message back before a new draft typed while the open was failing, losing neither", async () => {
    const open = deferred<HostResultBody>();
    const { client } = stubHost(() => open.promise);
    selectJourney("garden");
    setDraft("garden", "Hello");
    const sending = send(client, "garden");
    setDraft("garden", "Something else");
    open.reject(new HostRequestError("session_open_failed", "No."));
    await sending;
    expect(entry("garden")?.draft).toBe("Hello\n\nSomething else");
  });

  it("lets two Journeys open at once, each with its own state", async () => {
    const opens = new Map<string, Deferred<HostResultBody>>();
    const { client } = stubHost((body) => {
      if (body.type === "session.open") {
        const pending = deferred<HostResultBody>();
        opens.set(body.journey ?? "?", pending);
        return pending.promise;
      }
      return Promise.resolve({ type: "session.prompt", sessionId: body.type === "session.prompt" ? body.sessionId : "?", disposition: "started" });
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

  it("rejects a stop the host refused, so the composer can say why, and resolves one the connection's loss ended", async () => {
    let failure: Error = new HostRequestError("session_not_found", "No open session session-1.");
    const { client } = stubHost(async (body) => {
      if (body.type === "session.open") return opened("session-1", "garden");
      if (body.type === "session.prompt") return { type: "session.prompt", sessionId: "session-1", disposition: "started" };
      throw failure;
    });
    await sendInto(client, "garden", "Hello");
    applyHostEvent(event("session-1", { type: "queue_update", steering: ["a"], followUp: [] }));
    await expect(abort(client, "garden")).rejects.toThrow("No open session session-1.");
    expect(entry("garden")).toMatchObject({ running: true, queue: { steering: ["a"], followUp: [] }, draft: "" });

    failure = new ConnectionLostError(false, 1006, "");
    await expect(abort(client, "garden")).resolves.toBeUndefined();
  });
});

describe("a running turn", () => {
  /** Garden's host: plain prompts start at once; a steer, a follow-up and a stop wait on the answer the test gives. */
  function liveHost() {
    const answers: Deferred<HostResultBody>[] = [];
    const stops: Deferred<HostResultBody>[] = [];
    const stub = stubHost((body) => {
      switch (body.type) {
        case "session.open":
          return Promise.resolve(opened("session-1", "garden"));
        case "session.prompt": {
          if (!body.streamingBehavior) return Promise.resolve(answered("started"));
          const answer = deferred<HostResultBody>();
          answers.push(answer);
          return answer.promise;
        }
        case "session.abort": {
          const stop = deferred<HostResultBody>();
          stops.push(stop);
          return stop.promise;
        }
        default:
          throw new Error(`the stub host does not answer ${body.type}`);
      }
    });
    return { ...stub, answers, stops };
  }
  const answered = (disposition: PromptDisposition): HostResultBody => ({ type: "session.prompt", sessionId: "session-1", disposition });
  const stopped = (steering: string[], followUp: string[]): HostResultBody => ({
    type: "session.abort",
    sessionId: "session-1",
    withdrawn: { steering, followUp },
  });
  const piSays = (sessionEvent: SessionEvent) => applyHostEvent(event("session-1", sessionEvent));
  const delivered = (text: string) => {
    piSays({ type: "message_start", role: "user" });
    piSays({ type: "message_end", role: "user", text });
  };
  const userRows = () => entry("garden")?.rows.filter((row) => row.kind === "user");

  /** Garden answering "Hello", Pi's echo of it already in. */
  async function answering(client: HostConnection): Promise<void> {
    await sendInto(client, "garden", "Hello");
    piSays({ type: "agent_start" });
    delivered("Hello");
  }

  function queue(client: HostConnection, text: string, behavior: StreamingBehavior): Promise<PromptDisposition | undefined> {
    setDraft("garden", text);
    return queueMessage(client, "garden", behavior);
  }

  it("queues a steer: no row, the draft cleared, listed as sending until Pi answers, then as Pi's queue says", async () => {
    const { client, requests, answers } = liveHost();
    await answering(client);
    const queuing = queue(client, "Keep it short", "steer");

    expect(requests.at(-1)).toEqual({ type: "session.prompt", sessionId: "session-1", text: "Keep it short", streamingBehavior: "steer" });
    expect(entry("garden")).toMatchObject({ draft: "", rows: [{ kind: "user", text: "Hello" }], sending: [{ text: "Keep it short", behavior: "steer" }] });
    piSays({ type: "queue_update", steering: ["Keep it short"], followUp: [] });
    answers[0]?.resolve(answered("queued"));
    await expect(queuing).resolves.toBe("queued");
    expect(entry("garden")).toMatchObject({ sending: [], queue: { steering: ["Keep it short"], followUp: [] }, running: true });
  });

  it("queues nothing for an empty draft, nor while nothing runs", async () => {
    const { client, requests } = liveHost();
    await answering(client);
    await queue(client, "   ", "steer");
    piSays({ type: "agent_settled", aborted: false });
    await queue(client, "Later", "followUp");
    expect(requests.map((request) => request.type)).toEqual(["session.open", "session.prompt"]);
    expect(entry("garden")?.draft).toBe("Later");
  });

  it("swallows only its own prompt's echo, and draws each message Pi delivers where Pi took it, in Pi's words", async () => {
    const { client, answers } = liveHost();
    await answering(client);
    expect(entry("garden")).toMatchObject({ rows: [{ kind: "user", text: "Hello" }], awaitingEcho: false });

    const queuing = queue(client, "/skill:short", "steer");
    answers[0]?.resolve(answered("queued"));
    await queuing;
    piSays({ type: "text_delta", delta: "Looking." });
    piSays({ type: "message_end", role: "assistant", text: "Looking.", stopReason: "toolUse" });
    // Pi delivers what it queued, its skill expanded.
    delivered("Answer in one line.");
    expect(entry("garden")?.rows).toEqual([
      { kind: "user", text: "Hello" },
      { kind: "assistant", text: "Looking.", thinking: "", done: true, stopReason: "toolUse" },
      { kind: "user", text: "Answer in one line." },
    ]);
  });

  it("takes the echo that arrives before its prompt's answer as its own", async () => {
    const answer = deferred<HostResultBody>();
    const { client } = stubHost((body) => (body.type === "session.open" ? Promise.resolve(opened("session-1", "garden")) : answer.promise));
    selectJourney("garden");
    setDraft("garden", "Hello");
    const sending = send(client, "garden");
    await vi.waitFor(() => expect(entry("garden")?.running).toBe(true));
    piSays({ type: "agent_start" });
    delivered("Hello");
    answer.resolve(answered("started"));
    await expect(sending).resolves.toBe("started");
    expect(entry("garden")?.rows).toEqual([{ kind: "user", text: "Hello" }]);
  });

  it("draws a steer that started a run of its own once, from its echo, running from Pi's agent_start", async () => {
    const { client, answers } = liveHost();
    await answering(client);
    const queuing = queue(client, "Keep it short", "steer");
    // The turn ended as the steer left.
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")?.running).toBe(false);
    answers[0]?.resolve(answered("started"));
    await queuing;
    piSays({ type: "agent_start" });
    expect(entry("garden")?.running).toBe(true);
    delivered("Keep it short");
    expect(userRows()).toEqual([
      { kind: "user", text: "Hello" },
      { kind: "user", text: "Keep it short" },
    ]);
    expect(entry("garden")?.sending).toEqual([]);
  });

  it("keeps a deferred message listed as sending until its echo, or until the run it started settles without one", async () => {
    const { client, answers } = liveHost();
    await answering(client);
    const first = queue(client, "Keep it short", "steer");
    answers[0]?.resolve(answered("deferred"));
    await expect(first).resolves.toBe("deferred");
    // Pi put it after the turn that was settling: it is nowhere in Pi's queue.
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")?.sending).toMatchObject([{ text: "Keep it short" }]);
    piSays({ type: "agent_start" });
    delivered("Keep it short");
    expect(entry("garden")?.sending).toEqual([]);
    expect(userRows()?.at(-1)).toEqual({ kind: "user", text: "Keep it short" });

    const second = queue(client, "/skill:short", "followUp");
    answers[1]?.resolve(answered("deferred"));
    await second;
    piSays({ type: "agent_settled", aborted: false });
    piSays({ type: "agent_start" });
    delivered("Answer in one line.");
    expect(entry("garden")?.sending).toMatchObject([{ text: "/skill:short" }]);
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")?.sending).toEqual([]);
  });

  it("runs on Pi's own word: agent_start starts it, agent_settled ends it, whoever began the run", async () => {
    const { client } = liveHost();
    await answering(client);
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")).toMatchObject({ running: false, piRunning: false });
    piSays({ type: "agent_start" });
    expect(entry("garden")).toMatchObject({ running: true, piRunning: true });
    piSays({ type: "agent_start" });
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")).toMatchObject({ running: false, piRunning: false });
  });

  it("keeps on screen a queue Pi still holds when a turn settles", async () => {
    const { client } = liveHost();
    await answering(client);
    piSays({ type: "queue_update", steering: [], followUp: ["More"] });
    piSays({ type: "agent_settled", aborted: false });
    expect(entry("garden")?.queue).toEqual({ steering: [], followUp: ["More"] });
  });

  it("puts a refused message back in the draft before what was typed meanwhile, and rejects so the composer can say why", async () => {
    const { client, answers } = liveHost();
    await answering(client);
    const queuing = queue(client, "Keep it short", "steer");
    setDraft("garden", "Also");
    answers[0]?.reject(new HostRequestError("prompt_refused", "No model is selected for this session."));
    await expect(queuing).rejects.toThrow("No model is selected for this session.");
    expect(entry("garden")).toMatchObject({ draft: "Keep it short\n\nAlso", sending: [], running: true });
  });

  it("leaves a queued message Pi ran as a command nowhere, and the turn running", async () => {
    const { client, answers } = liveHost();
    await answering(client);
    const queuing = queue(client, "/report", "steer");
    answers[0]?.resolve(answered("handled"));
    await expect(queuing).resolves.toBe("handled");
    expect(entry("garden")).toMatchObject({ draft: "", sending: [], running: true, rows: [{ kind: "user", text: "Hello" }] });
  });

  it("takes back a prompt Pi ran as a command, and runs only if Pi's own events say a run began", async () => {
    const answers: Deferred<HostResultBody>[] = [];
    const { client } = stubHost((body) => {
      if (body.type === "session.open") return Promise.resolve(opened("session-1", "garden"));
      const answer = deferred<HostResultBody>();
      answers.push(answer);
      return answer.promise;
    });
    selectJourney("garden");
    setDraft("garden", "/report");
    const plain = send(client, "garden");
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    answers[0]?.resolve(answered("handled"));
    await expect(plain).resolves.toBe("handled");
    expect(entry("garden")).toMatchObject({ rows: [], draft: "", running: false, awaitingEcho: false });

    // A command that starts a run of its own, begun before the answer came.
    setDraft("garden", "/report");
    const starting = send(client, "garden");
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    piSays({ type: "agent_start" });
    answers[1]?.resolve(answered("handled"));
    await starting;
    expect(entry("garden")).toMatchObject({ rows: [], running: true });
  });

  it("stops: what Pi withdrew back in the draft, steering then follow-ups then what was typed, once, whichever comes first", async () => {
    const { client, requests, stops } = liveHost();
    await answering(client);
    setDraft("garden", "c");
    const stopping = abort(client, "garden");
    expect(requests.at(-1)).toEqual({ type: "session.abort", sessionId: "session-1" });
    piSays({ type: "queue_update", steering: [], followUp: [] });
    piSays({ type: "agent_settled", aborted: true });
    stops[0]?.resolve(stopped(["a"], ["b"]));
    await stopping;
    expect(entry("garden")).toMatchObject({ draft: "a\n\nb\n\nc", running: false, queue: { steering: [], followUp: [] } });

    // The answer before Pi's settle, into an empty draft.
    piSays({ type: "agent_start" });
    setDraft("garden", "");
    const again = abort(client, "garden");
    stops[1]?.resolve(stopped(["a"], ["b"]));
    await again;
    expect(entry("garden")).toMatchObject({ draft: "a\n\nb", running: false });
    piSays({ type: "agent_settled", aborted: true });
    expect(entry("garden")).toMatchObject({ draft: "a\n\nb", running: false });
  });
});

describe("the connection lost", () => {
  it("puts what was queued and what was on its way back in the draft, once each, before what was typed", async () => {
    const answer = deferred<HostResultBody>();
    const { client } = stubHost((body) => {
      if (body.type === "session.open") return Promise.resolve(opened("session-1", "garden"));
      if (!(body.type === "session.prompt" && body.streamingBehavior)) return Promise.resolve({ type: "session.prompt", sessionId: "session-1", disposition: "started" });
      return answer.promise;
    });
    await sendInto(client, "garden", "Hello");
    setDraft("garden", "c");
    const inFlight = queueMessage(client, "garden", "steer");
    // Pi had queued it, and the queue said so, but its answer was lost.
    applyHostEvent(event("session-1", { type: "queue_update", steering: ["a", "c"], followUp: ["b"] }));
    setDraft("garden", "d");

    connectionLost();
    answer.reject(new ConnectionLostError(false, 1006, ""));
    await expect(inFlight).resolves.toBeUndefined();
    expect(entry("garden")).toMatchObject({
      draft: "a\n\nc\n\nb\n\nd",
      queue: { steering: [], followUp: [] },
      sending: [],
      running: false,
      awaitingEcho: false,
    });
  });

  it("settles every answering conversation with a notice after the partial answer, and leaves the rest alone", async () => {
    const { client } = openingHost();
    await sendInto(client, "garden", "Hello");
    await sendInto(client, "beds", "Plant");
    applyHostEvent(event("session-1", { type: "message_start", role: "assistant" }));
    applyHostEvent(event("session-1", { type: "text_delta", delta: "Good mor" }));
    applyHostEvent(event("session-2", { type: "agent_settled", aborted: false }));
    selectJourney("attic");
    setDraft("attic", "Later");

    connectionLost();
    expect(entry("garden")).toMatchObject({ status: "open", running: false });
    expect(entry("garden")?.rows.slice(-2)).toEqual([
      { kind: "assistant", text: "Good mor", thinking: "", done: false },
      { kind: "notice", name: "Connection lost", tone: "notice", text: "The connection to the host was lost while Pi was answering." },
    ]);
    expect(entry("beds")).toMatchObject({ status: "open", running: false });
    expect(entry("beds")?.rows.some((row) => row.kind === "notice")).toBe(false);
    expect(entry("attic")).toEqual({ status: "idle", draft: "Later", rows: [], running: false, shown: { kind: "new" }, ...quiet });
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

describe("a Journey's sessions", () => {
  const folder = "/Users/test/.pi/agent/sessions/--Users-test-garden--";
  const garden = { id: "garden", projectPath: "/Users/test/garden" };
  const summary = (id: string, title: string, modified: number): SessionSummary => ({
    file: `${folder}/${id}.jsonl`,
    id,
    title,
    created: modified,
    modified,
  });
  const tomatoes = summary("tomatoes", "Plant the tomatoes", 2);
  const roses = summary("roses", "Prune the roses", 1);
  const said = (text: string): TranscriptEntry[] => [
    { kind: "user", text },
    { kind: "assistant", text: `Done: ${text}`, thinking: "", stopReason: "stop" },
  ];
  const readRows = (text: string) => [
    { kind: "user", text },
    { kind: "assistant", text: `Done: ${text}`, thinking: "", done: true, stopReason: "stop" },
  ];

  /** A host with Garden's sessions on disk; reads wait on `hold` when it returns a promise for that file. */
  function diskHost(options: { sessions?: SessionSummary[]; hold?: (file: string) => Promise<void> | undefined; failList?: () => boolean; failRead?: () => boolean } = {}) {
    let opens = 0;
    return stubHost(async (body) => {
      switch (body.type) {
        case "sessions.list":
          if (options.failList?.()) throw new HostRequestError("sessions_unreadable", "The session folder could not be read: permission denied.");
          return { type: "sessions.list", journey: body.journey, sessions: options.sessions ?? [tomatoes, roses], defaults: { model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "medium" } };
        case "session.transcript": {
          await options.hold?.(body.sessionFile);
          if (options.failRead?.()) throw new HostRequestError("sessions_unreadable", "This session could not be read: its file is not a Pi session Pi can load.");
          const listed = (options.sessions ?? [tomatoes, roses]).find((session) => session.file === body.sessionFile);
          return {
            type: "session.transcript",
            sessionFile: body.sessionFile,
            entries: said(listed?.title ?? "?"),
            earlier: 0,
            resumes: { model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "medium" },
          };
        }
        case "session.open":
          opens += 1;
          return opened(body.sessionFile ? `resumed-${opens}` : `session-${opens}`, "garden", body.sessionFile ? { sessionFile: body.sessionFile, diagnostics: ["extension x failed"] } : {});
        case "session.prompt":
          return { type: "session.prompt", sessionId: body.sessionId, disposition: "started" };
        default:
          throw new Error(`the stub host does not answer ${body.type}`);
      }
    });
  }
  const types = (requests: ClientRequestBody[]) => requests.map((request) => request.type);

  it("shows the most recent session on the first pick, read from its file, and opens nothing", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);

    expect(requests).toEqual([
      { type: "sessions.list", journey: "garden" },
      { type: "session.transcript", journey: "garden", sessionFile: tomatoes.file },
    ]);
    expect(entry("garden")).toMatchObject({ status: "idle", shown: { kind: "file", file: tomatoes.file }, rows: readRows("Plant the tomatoes") });
    expect(entry("garden")?.reading).toBeUndefined();
    expect(shownSummary(entry("garden"))).toEqual(tomatoes);
  });

  it("is reading from the pick until the session is read", async () => {
    let release: () => void = () => {};
    const { client, requests } = diskHost({ hold: () => new Promise<void>((resolve) => (release = resolve)) });
    const showing = showJourney(client, garden);
    expect(entry("garden")?.reading).toEqual({ status: "reading" });
    // Listed, and now reading the most recent session's file.
    await vi.waitFor(() => expect(types(requests)).toEqual(["sessions.list", "session.transcript"]));
    expect(entry("garden")?.reading).toEqual({ status: "reading" });
    release();
    await showing;
    expect(entry("garden")?.reading).toBeUndefined();
  });

  it("shows a new session when the Journey has none, and lists nothing for a Journey with no project path", async () => {
    const { client, requests } = diskHost({ sessions: [] });
    await showJourney(client, garden);
    expect(entry("garden")).toMatchObject({ shown: { kind: "new" }, rows: [], sessions: { status: "loaded", sessions: [] } });
    expect(entry("garden")?.reading).toBeUndefined();

    await showJourney(client, { id: "orchard" });
    expect(types(requests)).toEqual(["sessions.list"]);
    expect(useConversations.getState().current).toBe("orchard");
  });

  it("lists once: a Journey shown again is as it was left", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);
    setDraft("garden", "half a thought");
    await showJourney(client, { id: "beds", projectPath: "/Users/test/beds" });
    await showJourney(client, garden);

    expect(types(requests)).toEqual(["sessions.list", "session.transcript", "sessions.list", "session.transcript"]);
    expect(entry("garden")).toMatchObject({ draft: "half a thought", rows: readRows("Plant the tomatoes") });
  });

  it("keeps a list that failed with its words, and on Try again lists and shows the most recent", async () => {
    let failing = true;
    const { client } = diskHost({ failList: () => failing });
    await showJourney(client, garden);
    expect(entry("garden")?.sessions).toEqual({ status: "failed", sessions: [], failure: "The session folder could not be read: permission denied." });
    expect(entry("garden")).toMatchObject({ shown: { kind: "new" }, rows: [] });
    expect(entry("garden")?.reading).toBeUndefined();

    failing = false;
    await retrySessions(client, "garden");
    expect(entry("garden")).toMatchObject({ shown: { kind: "file", file: tomatoes.file }, rows: readRows("Plant the tomatoes"), sessions: { status: "loaded" } });
  });

  it("does not replace a conversation begun while the list was failing", async () => {
    let failing = true;
    const { client } = diskHost({ failList: () => failing });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");

    failing = false;
    await retrySessions(client, "garden");
    expect(entry("garden")).toMatchObject({ shown: { kind: "file", file: "/Users/test/.pi/agent/sessions/session-1.jsonl" }, rows: [{ kind: "user", text: "Hello" }] });
  });

  it("keeps a read that failed with its words, and reads again on Try again", async () => {
    let failing = true;
    const { client } = diskHost({ failRead: () => failing });
    await showJourney(client, garden);
    expect(entry("garden")?.reading).toEqual({ status: "failed", failure: "This session could not be read: its file is not a Pi session Pi can load." });

    failing = false;
    await retryRead(client, "garden");
    expect(entry("garden")?.reading).toBeUndefined();
    expect(entry("garden")?.rows).toEqual(readRows("Plant the tomatoes"));
  });

  it("drops a read that lands after a later pick", async () => {
    const waits = new Map<string, () => void>();
    const { client } = diskHost({ hold: (file) => (file === roses.file ? new Promise<void>((resolve) => waits.set(file, resolve)) : undefined) });
    await showJourney(client, garden);

    const late = chooseSession(client, "garden", roses.file);
    startNewSession("garden");
    waits.get(roses.file)?.();
    await late;
    expect(entry("garden")).toMatchObject({ shown: { kind: "new" }, rows: [] });
    expect(entry("garden")?.reading).toBeUndefined();
  });

  it("picks another session as a look, and the shown one, or any while a turn runs, as nothing", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);
    await chooseSession(client, "garden", roses.file);
    expect(entry("garden")).toMatchObject({ shown: { kind: "file", file: roses.file }, rows: readRows("Prune the roses") });

    await chooseSession(client, "garden", roses.file);
    await sendInto(client, "garden", "Hello");
    await chooseSession(client, "garden", tomatoes.file);
    startNewSession("garden");
    expect(entry("garden")?.shown).toEqual({ kind: "file", file: roses.file });
    expect(types(requests).filter((type) => type === "session.transcript")).toHaveLength(2);
    expect(types(requests)).not.toContain("session.close");
  });

  it("resumes the shown session's file on the first send, the message and what failed to load after what was read", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");

    expect(requests.find((request) => request.type === "session.open")).toEqual({ type: "session.open", journey: "garden", sessionFile: tomatoes.file });
    expect(entry("garden")).toMatchObject({
      status: "open",
      session: { id: "resumed-1", file: tomatoes.file },
      shown: { kind: "file", file: tomatoes.file },
      rows: [...readRows("Plant the tomatoes"), { kind: "diagnostic", text: "extension x failed" }, { kind: "user", text: "Hello" }],
    });
  });

  it("starts a new session on the first send after New session, and shows it from then on", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);
    startNewSession("garden");
    expect(entry("garden")).toMatchObject({ shown: { kind: "new" }, rows: [] });

    await sendInto(client, "garden", "Hello");
    expect(requests.find((request) => request.type === "session.open")).toEqual({ type: "session.open", journey: "garden" });
    expect(entry("garden")?.shown).toEqual({ kind: "file", file: "/Users/test/.pi/agent/sessions/session-1.jsonl" });
  });

  it("opens the shown session when it is not the open one, and prompts the open one when it is", async () => {
    const { client, requests } = diskHost();
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    applyHostEvent(event("resumed-1", { type: "agent_settled", aborted: false }));
    await sendInto(client, "garden", "Again");
    expect(types(requests).filter((type) => type === "session.open")).toHaveLength(1);

    applyHostEvent(event("resumed-1", { type: "agent_settled", aborted: false }));
    await chooseSession(client, "garden", roses.file);
    await sendInto(client, "garden", "Elsewhere");
    expect(requests.filter((request) => request.type === "session.open").at(-1)).toEqual({ type: "session.open", journey: "garden", sessionFile: roses.file });
    expect(entry("garden")?.session).toMatchObject({ id: "resumed-2", file: roses.file });
  });

  it("resumes a session whose file could not be read: what failed to read it may not stop Pi", async () => {
    const { client, requests } = diskHost({ failRead: () => true });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    expect(requests.find((request) => request.type === "session.open")).toEqual({ type: "session.open", journey: "garden", sessionFile: tomatoes.file });
  });

  it("lists again when a turn settles, given the connection, so a session it started is named", async () => {
    const { client, requests } = diskHost({ sessions: [] });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    applyHostEvent(event("session-1", { type: "agent_settled", aborted: false }), client);
    await vi.waitFor(() => expect(types(requests).filter((type) => type === "sessions.list")).toHaveLength(2));
  });

  it("leaves the rows of a session not shown alone, and still settles its turn", async () => {
    const { client } = openingHost();
    await sendInto(client, "garden", "Hello");
    useConversations.setState((state) => ({ entries: { ...state.entries, garden: { ...state.entries.garden!, shown: { kind: "new" }, rows: [] } } }));
    applyHostEvent(event("session-1", { type: "text_delta", delta: "late" }));
    applyHostEvent(event("session-1", { type: "agent_settled", aborted: false }));
    expect(entry("garden")).toMatchObject({ rows: [], running: false });
  });
});

describe("a session's model and thinking", () => {
  const folder = "/Users/test/.pi/agent/sessions/--Users-test-garden--";
  const garden = { id: "garden", projectPath: "/Users/test/garden" };
  const testRef = { provider: "anthropic", id: "claude-test" };
  const deepRef = { provider: "anthropic", id: "claude-deep" };
  const testModel: AvailableModel = { ...testRef, name: "Claude Test", reasoning: true, thinkingLevels: ["off", "minimal", "low", "medium", "high"] };
  const deepModel: AvailableModel = { ...deepRef, name: "Claude Deep", reasoning: true, thinkingLevels: ["low", "medium", "high", "xhigh", "max"] };
  const summary = (id: string, modified: number): SessionSummary => ({ file: `${folder}/${id}.jsonl`, id, title: id, created: modified, modified });
  const tomatoes = summary("tomatoes", 2);
  const roses = summary("roses", 1);

  /**
   * A host with Garden's two sessions, tomatoes recorded on claude-deep at
   * high and roses on claude-test at low, and claude-test at `defaultLevel`
   * for a new one. It opens on what it is asked, and configures as the test
   * says.
   */
  function modelHost(options: { defaultLevel?: string; open?: (body: ClientRequestBody) => Promise<HostResultBody> | undefined; configure?: (body: Extract<ClientRequestBody, { type: "session.configure" }>) => Promise<HostResultBody>; holdList?: () => Promise<void> | undefined; holdRead?: (file: string) => Promise<void> | undefined } = {}) {
    let opens = 0;
    return stubHost(async (body) => {
      switch (body.type) {
        case "sessions.list":
          await options.holdList?.();
          return { type: "sessions.list", journey: body.journey, sessions: [tomatoes, roses], defaults: { model: testRef, thinkingLevel: options.defaultLevel ?? "medium" } };
        case "session.transcript":
          await options.holdRead?.(body.sessionFile);
          return {
            type: "session.transcript",
            sessionFile: body.sessionFile,
            entries: [],
            earlier: 0,
            resumes: body.sessionFile === tomatoes.file ? { model: deepRef, thinkingLevel: "high" } : { model: testRef, thinkingLevel: "low" },
          };
        case "session.open": {
          const answer = options.open?.(body);
          if (answer) return answer;
          opens += 1;
          // On the pick, else as the file or the defaults say.
          const own = body.sessionFile === tomatoes.file ? { model: deepRef, thinkingLevel: "high" } : body.sessionFile === roses.file ? { model: testRef, thinkingLevel: "low" } : { model: testRef, thinkingLevel: options.defaultLevel ?? "medium" };
          const runsOn = body.model ? { model: body.model, thinkingLevel: body.thinkingLevel ?? "medium" } : own;
          return opened(`session-${opens}`, "garden", { ...(body.sessionFile ? { sessionFile: body.sessionFile } : {}), ...runsOn });
        }
        case "session.configure":
          if (options.configure) return options.configure(body);
          return { type: "session.configure", sessionId: body.sessionId, model: body.model ?? testRef, thinkingLevel: body.thinkingLevel ?? "medium" };
        case "session.prompt":
          return { type: "session.prompt", sessionId: body.sessionId, disposition: "started" };
        default:
          throw new Error(`the stub host does not answer ${body.type}`);
      }
    });
  }
  const typesOf = (requests: ClientRequestBody[]) => requests.map((request) => request.type);
  const settle = (sessionId: string) => applyHostEvent(event(sessionId, { type: "agent_settled", aborted: false }));

  it("says what the session shown runs on: a file's own, read with it, and the Journey's defaults for a new one", async () => {
    const { client } = modelHost();
    await showJourney(client, garden);
    expect(shownChoice(entry("garden"))).toEqual({ model: deepRef, thinkingLevel: "high", source: "file" });
    startNewSession("garden");
    expect(shownChoice(entry("garden"))).toEqual({ model: testRef, thinkingLevel: "medium", source: "defaults" });
  });

  it("holds a pick for a session not open and sends nothing for it; a look drops it", async () => {
    const { client, requests } = modelHost({ defaultLevel: "off" });
    await showJourney(client, garden);
    startNewSession("garden");
    const before = typesOf(requests);

    await expect(chooseModel(client, "garden", deepModel)).resolves.toEqual({ from: "off", to: "low" });
    await expect(chooseThinking(client, "garden", "max")).resolves.toBeUndefined();
    expect(shownChoice(entry("garden"))).toEqual({ model: deepRef, thinkingLevel: "max", source: "pick" });
    expect(typesOf(requests)).toEqual(before);

    await chooseSession(client, "garden", roses.file);
    expect(entry("garden")?.pick).toBeUndefined();
    expect(shownChoice(entry("garden"))).toEqual({ model: testRef, thinkingLevel: "low", source: "file" });
    startNewSession("garden");
    expect(shownChoice(entry("garden"))).toEqual({ model: testRef, thinkingLevel: "off", source: "defaults" });
  });

  it("holds no pick that only says what is shown already", async () => {
    const { client } = modelHost();
    await showJourney(client, garden);
    await chooseModel(client, "garden", deepModel);
    expect(entry("garden")?.pick).toBeUndefined();
    await chooseThinking(client, "garden", "low");
    await chooseThinking(client, "garden", "high");
    expect(entry("garden")?.pick).toBeUndefined();
  });

  it("carries the pick on the open, the model and its level together, and takes what the open answered", async () => {
    const { client, requests } = modelHost();
    await showJourney(client, garden);
    await chooseThinking(client, "garden", "low");
    await sendInto(client, "garden", "Hello");

    expect(requests.find((request) => request.type === "session.open")).toEqual({
      type: "session.open",
      journey: "garden",
      sessionFile: tomatoes.file,
      model: deepRef,
      thinkingLevel: "low",
    });
    expect(entry("garden")?.pick).toBeUndefined();
    expect(entry("garden")?.session).toMatchObject({ model: deepRef, thinkingLevel: "low" });
    expect(shownChoice(entry("garden"))).toEqual({ model: deepRef, thinkingLevel: "low", source: "session" });
  });

  it("keeps the pick when the open refuses its model, and names the model refused", async () => {
    let refusing = true;
    const { client } = modelHost({
      open: () => (refusing ? Promise.reject(new HostRequestError("model_not_available", "No credential for anthropic: sign in first.")) : undefined),
    });
    await showJourney(client, garden);
    startNewSession("garden");
    await chooseModel(client, "garden", deepModel);
    await sendInto(client, "garden", "Hello");

    expect(entry("garden")).toMatchObject({
      status: "failed",
      failure: "No credential for anthropic: sign in first.",
      draft: "Hello",
      pick: { model: deepRef, thinkingLevel: "medium" },
      refusedModel: deepRef,
    });

    refusing = false;
    await send(client, "garden");
    expect(entry("garden")?.refusedModel).toBeUndefined();
    expect(entry("garden")).toMatchObject({ status: "open", session: { model: deepRef } });
  });

  it("names no model refused when the open failed for another reason", async () => {
    const { client } = modelHost({ open: () => Promise.reject(new HostRequestError("session_open_failed", "Pi could not start.")) });
    await showJourney(client, garden);
    await chooseModel(client, "garden", testModel);
    await sendInto(client, "garden", "Hello");
    expect(entry("garden")).toMatchObject({ status: "failed", pick: { model: testRef, thinkingLevel: "high" } });
    expect(entry("garden")?.refusedModel).toBeUndefined();
  });

  it("changes the open session through session.configure, the model with the level shown, and shows the answer", async () => {
    const answer = deferred<HostResultBody>();
    const { client, requests } = modelHost({ configure: () => answer.promise });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    settle("session-1");

    const changing = chooseModel(client, "garden", testModel);
    expect(entry("garden")?.configuring).toBe(true);
    expect(requests.at(-1)).toEqual({ type: "session.configure", sessionId: "session-1", model: testRef, thinkingLevel: "high" });
    // Until the host answers, the header keeps what the session runs on.
    expect(shownChoice(entry("garden"))).toEqual({ model: deepRef, thinkingLevel: "high", source: "session" });

    answer.resolve({ type: "session.configure", sessionId: "session-1", model: testRef, thinkingLevel: "high" });
    await expect(changing).resolves.toBeUndefined();
    expect(entry("garden")?.configuring).toBe(false);
    expect(shownChoice(entry("garden"))).toEqual({ model: testRef, thinkingLevel: "high", source: "session" });
  });

  it("says where a change moved the level, by the host's answer", async () => {
    const { client } = modelHost();
    await showJourney(client, garden);
    await chooseSession(client, "garden", roses.file);
    await chooseThinking(client, "garden", "off");
    await sendInto(client, "garden", "Hello");
    settle("session-1");
    await expect(chooseModel(client, "garden", deepModel)).resolves.toEqual({ from: "off", to: "low" });
    expect(entry("garden")?.session).toMatchObject({ model: deepRef, thinkingLevel: "low" });
  });

  it("changes nothing when the pick is what the session runs on already", async () => {
    const { client, requests } = modelHost();
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    settle("session-1");
    await chooseModel(client, "garden", deepModel);
    await chooseThinking(client, "garden", "high");
    expect(typesOf(requests)).not.toContain("session.configure");
  });

  it("takes no second pick while a change is in flight, and keeps the session's values when the change is refused", async () => {
    const answer = deferred<HostResultBody>();
    const { client, requests } = modelHost({ configure: () => answer.promise });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    settle("session-1");

    const changing = chooseThinking(client, "garden", "max");
    await chooseThinking(client, "garden", "low");
    await chooseModel(client, "garden", testModel);
    expect(typesOf(requests).filter((type) => type === "session.configure")).toHaveLength(1);

    answer.reject(new HostRequestError("model_not_available", "No credential for anthropic: sign in first."));
    await expect(changing).rejects.toThrow("No credential for anthropic: sign in first.");
    expect(entry("garden")).toMatchObject({ configuring: false, session: { model: deepRef, thinkingLevel: "high" } });
  });

  it("changes the session while a turn runs: Pi takes it at its next request", async () => {
    const { client, requests } = modelHost();
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    expect(entry("garden")?.running).toBe(true);
    await chooseThinking(client, "garden", "max");
    expect(requests.at(-1)).toEqual({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "max" });
    expect(entry("garden")?.session).toMatchObject({ thinkingLevel: "max" });
  });

  it("writes a change's answer to the session it changed, whatever is shown when it lands", async () => {
    const answer = deferred<HostResultBody>();
    const { client } = modelHost({ configure: () => answer.promise });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    settle("session-1");

    const changing = chooseThinking(client, "garden", "max");
    await chooseSession(client, "garden", roses.file);
    answer.resolve({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "max" });
    await changing;
    expect(entry("garden")?.session).toMatchObject({ id: "session-1", thinkingLevel: "max" });
    expect(shownChoice(entry("garden"))).toEqual({ model: testRef, thinkingLevel: "low", source: "file" });
  });

  it("says nothing of a change the connection's loss cut off", async () => {
    const { client } = modelHost({ configure: () => Promise.reject(new ConnectionLostError(false, 1006, "")) });
    await showJourney(client, garden);
    await sendInto(client, "garden", "Hello");
    settle("session-1");
    await expect(chooseThinking(client, "garden", "max")).resolves.toBeUndefined();
    expect(entry("garden")).toMatchObject({ configuring: false, session: { thinkingLevel: "high" } });
  });

  it("takes no pick while the session opens", async () => {
    const open = deferred<HostResultBody>();
    const { client, requests } = modelHost({ open: () => open.promise });
    await showJourney(client, garden);
    selectJourney("garden");
    setDraft("garden", "Hello");
    const sending = send(client, "garden");
    await chooseModel(client, "garden", testModel);
    expect(entry("garden")?.pick).toBeUndefined();
    open.resolve(opened("session-1", "garden", { sessionFile: tomatoes.file, model: deepRef, thinkingLevel: "high" }));
    await sending;
    expect(typesOf(requests)).not.toContain("session.configure");
  });

  it("keeps the defaults while the list is read again, and writes a file's own only for the latest look", async () => {
    let releaseList: () => void = () => {};
    let releaseRead: () => void = () => {};
    let holdingList = false;
    const { client } = modelHost({
      holdList: () => (holdingList ? new Promise<void>((resolve) => (releaseList = resolve)) : undefined),
      holdRead: (file) => (file === roses.file ? new Promise<void>((resolve) => (releaseRead = resolve)) : undefined),
    });
    await showJourney(client, garden);
    holdingList = true;
    const listing = refreshSessions(client, "garden");
    expect(entry("garden")?.sessions).toMatchObject({ status: "loading", defaults: { model: testRef, thinkingLevel: "medium" } });
    releaseList();
    await listing;

    const late = chooseSession(client, "garden", roses.file);
    startNewSession("garden");
    releaseRead();
    await late;
    expect(entry("garden")?.resumes).toBeUndefined();
    expect(shownChoice(entry("garden"))?.source).toBe("defaults");
  });
});
