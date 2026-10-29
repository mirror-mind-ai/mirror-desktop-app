import type { ClientRequestBody, HostEvent, HostResultBody, SessionEvent, SessionSummary, TranscriptEntry } from "@mirror-desktop/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionLostError, type HostConnection, HostRequestError } from "../host/client.ts";
import { resetAllStores } from "../stores/registry.ts";
import {
  abort,
  applyHostEvent,
  chooseSession,
  connectionLost,
  type Conversation,
  isWorking,
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
    expect(entry("garden")).toEqual({ status: "idle", draft: "", rows: [], running: false, shown: { kind: "new" } });
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
      shown: { kind: "new" },
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

describe("the connection lost", () => {
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
    expect(entry("attic")).toEqual({ status: "idle", draft: "Later", rows: [], running: false, shown: { kind: "new" } });
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
          return { type: "sessions.list", journey: body.journey, sessions: options.sessions ?? [tomatoes, roses] };
        case "session.transcript": {
          await options.hold?.(body.sessionFile);
          if (options.failRead?.()) throw new HostRequestError("sessions_unreadable", "This session could not be read: its file is not a Pi session Pi can load.");
          const listed = (options.sessions ?? [tomatoes, roses]).find((session) => session.file === body.sessionFile);
          return { type: "session.transcript", sessionFile: body.sessionFile, entries: said(listed?.title ?? "?"), earlier: 0 };
        }
        case "session.open":
          opens += 1;
          return opened(body.sessionFile ? `resumed-${opens}` : `session-${opens}`, "garden", body.sessionFile ? { sessionFile: body.sessionFile, diagnostics: ["extension x failed"] } : {});
        case "session.prompt":
          return { type: "session.prompt", sessionId: body.sessionId };
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
