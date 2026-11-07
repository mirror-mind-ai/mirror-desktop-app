import { type HostEvent, PROTOCOL_VERSION, type SessionEvent } from "@mirror-desktop/protocol";
import { describe, expect, it, vi } from "vitest";

import { HostClient, HostRequestError, hostEndpoint } from "../host/client.ts";
import { endFakeHosts, outboundProblem, type ScriptedSession, serveFakeHost, type World } from "./fakeHost.ts";
import { takeLog } from "./traffic.ts";
import { loadTurn } from "./turns.ts";
import { take } from "./violations.ts";

const answer = (prompt: string): SessionEvent[] => [
  { type: "agent_start" },
  { type: "message_start", role: "user" },
  { type: "message_end", role: "user", text: prompt },
  { type: "message_start", role: "assistant" },
  { type: "text_delta", delta: "Tides " },
  { type: "text_delta", delta: "turn." },
  { type: "message_end", role: "assistant", text: "Tides turn.", stopReason: "stop" },
  { type: "agent_end" },
  { type: "agent_settled", aborted: false },
];

const world = (overrides: Partial<World> = {}): World => ({
  models: [{ provider: "anthropic", id: "claude-test", name: "Claude Test", reasoning: true, thinkingLevels: ["off", "minimal", "low", "medium", "high"] }],
  journeys: [
    { id: "garden", name: "Garden", status: "active", description: "Tending things", projectPath: "/Users/test/garden" },
    { id: "attic", name: "Attic", status: "active", description: "No project yet" },
  ],
  turns: [],
  ...overrides,
});

/** A socket that speaks raw frames, for what the real client would never send. */
async function rawSocket(url: string) {
  const socket = new WebSocket(url);
  const received: unknown[] = [];
  const closes: number[] = [];
  socket.addEventListener("message", (event) => received.push(JSON.parse(String((event as MessageEvent).data))));
  socket.addEventListener("close", (event) => closes.push((event as CloseEvent).code));
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  return { socket, received, closes, send: (frame: unknown) => socket.send(typeof frame === "string" ? frame : JSON.stringify(frame)) };
}

/** A world that answers "Hello" once. */
const withHello = (): Partial<World> => ({ turns: [{ prompt: "Hello", events: answer("Hello") }] });

const urlOf = (endpoint: { port: number }) => `ws://127.0.0.1:${endpoint.port}`;

/** Every session event a client received, by type. */
function eventTypes(events: HostEvent[]): string[] {
  return events.flatMap((event) => (event.type === "session.event" ? [event.event.type] : []));
}

async function connected(endpoint: { port: number; token: string }) {
  const { client } = await HostClient.connect(endpoint);
  const events: HostEvent[] = [];
  client.onEvent = (event) => events.push(event);
  return { client, events };
}

describe("the fake host's handshake", () => {
  it("answers the real client's hello with the scripted identity, then the world's models and Journeys", async () => {
    const host = serveFakeHost(world());
    const { client, host: identity } = await HostClient.connect(host.endpoint);
    expect(identity).toEqual(host.identity);
    await expect(client.request({ type: "models.available" })).resolves.toEqual({
      type: "models.available",
      models: world().models,
    });
    await expect(client.request({ type: "journeys.list" })).resolves.toEqual({
      type: "journeys.list",
      journeys: world().journeys,
    });
  });

  it("hands its endpoint to the UI through the scripted host_endpoint command", async () => {
    const host = serveFakeHost(world());
    await expect(hostEndpoint()).resolves.toEqual(host.endpoint);
  });

  it("refuses a hello with another token, closes with 4401, and records it", async () => {
    const host = serveFakeHost(world());
    const raw = await rawSocket(urlOf(host.endpoint));
    raw.send({ id: "1", request: { type: "hello", token: "someone-else", protocolVersion: PROTOCOL_VERSION } });
    await vi.waitFor(() => expect(raw.closes).toEqual([4401]));
    expect(raw.received).toEqual([{ id: "1", error: { code: "unauthorized", message: expect.any(String) } }]);
    expect(take()).toEqual([{ kind: "handshake", detail: expect.stringContaining("token") }]);
  });

  it("refuses a hello in another protocol version, and records it", async () => {
    const host = serveFakeHost(world());
    const raw = await rawSocket(urlOf(host.endpoint));
    raw.send({ id: "1", request: { type: "hello", token: host.endpoint.token, protocolVersion: "0.0.1" } });
    await vi.waitFor(() => expect(raw.received).toHaveLength(1));
    expect(raw.received[0]).toMatchObject({ id: "1", error: { code: "unsupported_protocol_version" } });
    expect(take()).toEqual([{ kind: "handshake", detail: expect.stringContaining("0.0.1") }]);
  });

  it("refuses any request before hello, closes with 4401, and records it by type", async () => {
    const host = serveFakeHost(world());
    const raw = await rawSocket(urlOf(host.endpoint));
    raw.send({ id: "1", request: { type: "journeys.list" } });
    await vi.waitFor(() => expect(raw.closes).toEqual([4401]));
    expect(raw.received).toEqual([{ id: "1", error: { code: "unauthorized", message: expect.any(String) } }]);
    expect(take()).toEqual([{ kind: "handshake", detail: expect.stringContaining("journeys.list before hello") }]);
  });
});

describe("the fake host and the protocol", () => {
  it("answers a request that breaks the protocol as the real host does, and records it", async () => {
    const host = serveFakeHost(world());
    const raw = await rawSocket(urlOf(host.endpoint));
    raw.send({ id: "7", request: { type: "session.open" } });
    raw.send("not json");
    await vi.waitFor(() => expect(raw.received).toHaveLength(2));
    expect(raw.received).toEqual([
      { id: "?", error: { code: "malformed_request", message: expect.any(String) } },
      { id: "?", error: { code: "malformed_request", message: expect.any(String) } },
    ]);
    expect(take()).toEqual([
      { kind: "protocol", detail: expect.stringContaining("session.open") },
      { kind: "protocol", detail: expect.stringContaining("not JSON") },
    ]);
  });

  it("names a message of its own that breaks the protocol, by type and request id", () => {
    expect(outboundProblem({ id: "3", result: { type: "session.open", sessionId: "session-1" } })).toMatch(
      /^the reply to request 3 \(session\.open\) breaks the protocol: /,
    );
    expect(outboundProblem({ id: "3", result: { type: "ping", uptimeMs: 1 } })).toBeNull();
  });

  it("refuses a world that breaks the protocol, naming the field, before any test runs on it", () => {
    const broken = world({ journeys: [{ id: "garden", name: "Garden", status: "active" } as never] });
    expect(() => serveFakeHost(broken)).toThrow(/^The fake host's world: journeys\[0\]\.description: /);
  });

  it("refuses a turn whose user message is not the prompt it is scripted for", () => {
    const mismatched = world({ turns: [{ prompt: "Hello", events: answer("Goodbye") }] });
    expect(() => serveFakeHost(mismatched)).toThrow(
      'The fake host\'s world: turns[0] is scripted for "Hello" but its user message says "Goodbye"',
    );
  });

  it("refuses a turn that breaks the shape of a turn, naming it", () => {
    const broken = world({ turns: [{ prompt: "Hello", events: answer("Hello").slice(0, -1) }] });
    expect(() => serveFakeHost(broken)).toThrow(/^turns\[0\] \("Hello"\): event 7 \(agent_end\): a turn ends with agent_settled/);
  });
});

describe("the fake host's sessions", () => {
  it("opens a session for a scripted Journey with a project path, with predictable ids", async () => {
    const host = serveFakeHost(world());
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toEqual({
      type: "session.open",
      sessionId: "session-1",
      sessionFile: "/Users/test/.pi/agent/sessions/session-1.jsonl",
      cwd: "/Users/test/garden",
      journey: "garden",
      mirrorConversationId: "conversation-1",
      model: { provider: "anthropic", id: "claude-test" },
      thinkingLevel: "medium",
      diagnostics: [],
    });
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
  });

  it("answers what the world cannot at once, with a named error, and records each", async () => {
    const host = serveFakeHost(world());
    const { client } = await connected(host.endpoint);
    const refused = async (request: Parameters<HostClient["request"]>[0]) => {
      const error = await client.request(request).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(HostRequestError);
      expect((error as HostRequestError).message).toMatch(/fake host/);
    };
    await refused({ type: "session.open", journey: "nowhere" });
    await refused({ type: "session.open", journey: "attic" });
    await refused({ type: "session.open", cwd: "/Users/test" });
    await refused({ type: "session.prompt", sessionId: "session-9", text: "Hello" });
    await refused({ type: "session.abort", sessionId: "session-1" });
    expect(take().map((violation) => `${violation.kind}: ${violation.detail}`)).toEqual([
      expect.stringMatching(/^unscripted: session\.open for "nowhere"/),
      expect.stringMatching(/^unscripted: session\.open for "attic", which has no project path/),
      expect.stringMatching(/^unscripted: session\.open for the directory \/Users\/test/),
      expect.stringMatching(/^unscripted: session\.prompt for session-9/),
      expect.stringMatching(/^unscripted: session\.abort/),
    ]);
  });

  it("plays a turn after answering its prompt, stamped with the session, to every connected client", async () => {
    const host = serveFakeHost(world(withHello()));
    const first = await connected(host.endpoint);
    const second = await connected(host.endpoint);
    await first.client.request({ type: "session.open", journey: "garden" });
    await expect(first.client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" })).resolves.toEqual({
      type: "session.prompt",
      sessionId: "session-1",
      disposition: "started",
    });
    const played = answer("Hello").map((event) => event.type);
    await vi.waitFor(() => expect(eventTypes(first.events)).toEqual(played));
    await vi.waitFor(() => expect(eventTypes(second.events)).toEqual(played));
    expect(first.events.every((event) => event.type === "session.event" && event.sessionId === "session-1")).toBe(true);
    const stamps = first.events.map((event) => (event.type === "session.event" ? event.at : 0));
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
  });

  // An extension that fails inside Pi is reported as a host event, not a
  // session event, so a turn's fixture cannot carry it: the turn scripts it.
  it("reports a turn's extension failures after answering its prompt and before its events", async () => {
    const failure = { extension: "mirror", event: "before_agent_start", message: "the database is locked" };
    const host = serveFakeHost(world({ turns: [{ prompt: "Hello", events: answer("Hello"), extensionErrors: [failure] }] }));
    const { client, events } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });

    await vi.waitFor(() => expect(events).toHaveLength(answer("Hello").length + 1));
    expect(events[0]).toEqual({ type: "session.extension_error", sessionId: "session-1", ...failure });
    expect(eventTypes(events.slice(1))).toEqual(answer("Hello").map((event) => event.type));
  });

  it("refuses an extension failure that breaks the protocol, naming the turn", () => {
    const broken = world({
      turns: [{ prompt: "Hello", events: answer("Hello"), extensionErrors: [{ extension: "mirror", event: 1 } as never] }],
    });
    expect(() => serveFakeHost(broken)).toThrow(/^The fake host's world: turns\[0\]\.extensionErrors\[0\]\.event: /);
  });

  it("stops sending to a client once it closed", async () => {
    const host = serveFakeHost(world(withHello()));
    const staying = await connected(host.endpoint);
    const leaving = await connected(host.endpoint);
    leaving.client.close();
    await staying.client.request({ type: "session.open", journey: "garden" });
    await staying.client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    await vi.waitFor(() => expect(eventTypes(staying.events)).toHaveLength(answer("Hello").length));
    expect(leaving.events).toEqual([]);
  });

  it("holds a turn until the test releases it, step by step or whole", async () => {
    const host = serveFakeHost(world({ turns: [{ prompt: "Hello", events: answer("Hello"), held: true }] }));
    const { client, events } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    const turn = host.heldTurn();
    expect(turn.remaining).toBe(answer("Hello").length);

    turn.releaseThrough((event) => event.type === "text_delta");
    await vi.waitFor(() => expect(eventTypes(events)).toHaveLength(5));
    expect(eventTypes(events).at(-1)).toBe("text_delta");
    expect(turn.remaining).toBe(4);

    turn.release();
    await vi.waitFor(() => expect(eventTypes(events)).toHaveLength(answer("Hello").length));
    expect(turn.remaining).toBe(0);
    expect(() => turn.releaseThrough((event) => event.type === "agent_end")).toThrow(/no agent_end|nothing left|no event/i);
  });

  it("records a prompt with no turn left, or one that does not match the next turn", async () => {
    const host = serveFakeHost(world(withHello()));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "Hi" })).rejects.toThrow(/fake host/);
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "Again" })).rejects.toThrow(/fake host/);
    expect(take().map((violation) => violation.detail)).toEqual([
      'session.prompt "Hi" does not match the next scripted turn, "Hello"',
      'session.prompt "Again": no scripted turn is left',
    ]);
  });

  it("records a scripted turn that was never played, when the test ends", () => {
    serveFakeHost(world(withHello()));
    endFakeHosts();
    expect(take()).toEqual([{ kind: "unscripted", detail: 'the turn scripted for "Hello" was never played' }]);
  });

  it("writes what crossed the socket to the traffic log", async () => {
    const host = serveFakeHost(world());
    takeLog();
    const { client } = await connected(host.endpoint);
    await client.request({ type: "journeys.list" });
    expect(takeLog()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/#1 → hello \(request 1\)/),
        expect.stringMatching(/#1 ← hello \(request 1\)/),
        expect.stringMatching(/#1 → journeys\.list \(request 2\)/),
        expect.stringMatching(/#1 ← journeys\.list \(request 2\)/),
      ]),
    );
  });
});

describe("the fake host's scripted failures", () => {
  const notConfigured = { code: "mirror_not_configured", message: "No Mirror home is configured on this machine yet." } as const;

  it("fails a scripted request with the real host's error until the test stops it, recording nothing", async () => {
    const host = serveFakeHost(world({ failures: [{ request: "journeys.list", error: notConfigured }] }));
    const { client } = await connected(host.endpoint);
    const error = await client.request({ type: "journeys.list" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HostRequestError);
    expect(error).toMatchObject({ code: "mirror_not_configured", message: notConfigured.message });
    await expect(client.request({ type: "journeys.list" })).rejects.toThrow(notConfigured.message);

    host.stopFailing("journeys.list");
    await expect(client.request({ type: "journeys.list" })).resolves.toMatchObject({ type: "journeys.list" });
    expect(take()).toEqual([]);
  });

  it("refuses hello as scripted, closing with 4401 as the real host does for unauthorized", async () => {
    const unauthorized = { code: "unauthorized", message: "The host did not recognize this token." } as const;
    const host = serveFakeHost(world({ failures: [{ request: "hello", error: unauthorized }] }));
    const raw = await rawSocket(urlOf(host.endpoint));
    raw.send({ id: "1", request: { type: "hello", token: host.endpoint.token, protocolVersion: PROTOCOL_VERSION } });
    await vi.waitFor(() => expect(raw.closes).toEqual([4401]));
    expect(raw.received).toEqual([{ id: "1", error: unauthorized }]);

    host.stopFailing("hello");
    await expect(HostClient.connect(host.endpoint)).resolves.toMatchObject({ host: host.identity });
    expect(take()).toEqual([]);
  });

  it("fails session.open for the scripted Journey only", async () => {
    const failed = { code: "session_open_failed", message: "The project path does not exist." } as const;
    const host = serveFakeHost(
      world({
        journeys: [...world().journeys, { id: "beds", name: "Beds", status: "active", description: "", projectPath: "/Users/test/beds" }],
        failures: [{ request: "session.open", journey: "garden", error: failed }],
      }),
    );
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden" })).rejects.toThrow(failed.message);
    await expect(client.request({ type: "session.open", journey: "beds" })).resolves.toMatchObject({ sessionId: "session-1" });
    host.stopFailing("session.open", "garden");
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toMatchObject({ sessionId: "session-2" });
    expect(take()).toEqual([]);
  });

  it("records a scripted failure no request ever met, when the test ends", () => {
    serveFakeHost(world({ failures: [{ request: "journeys.list", error: notConfigured }] }));
    endFakeHosts();
    expect(take()).toEqual([{ kind: "unscripted", detail: "the failure scripted for journeys.list was never answered" }]);
  });

  it("refuses to stop a failure that was never scripted", () => {
    const host = serveFakeHost(world());
    expect(() => host.stopFailing("journeys.list")).toThrow("No failure is scripted for journeys.list.");
  });

  it("refuses a failure that breaks the protocol, or names a Journey the world does not have", () => {
    expect(() => serveFakeHost(world({ failures: [{ request: "journeys.list", error: { code: "nope", message: "" } as never }] }))).toThrow(
      /^The fake host's world: failures\[0\]\.error\.code: /,
    );
    expect(() => serveFakeHost(world({ failures: [{ request: "session.open", journey: "nowhere", error: notConfigured }] }))).toThrow(
      'The fake host\'s world: failures[0] fails session.open for "nowhere", a Journey the world does not have',
    );
  });
});

describe("the fake host's held opens", () => {
  it("answers a held session.open only when the test releases it, and holds only the first", async () => {
    const host = serveFakeHost(world({ heldOpens: ["garden"] }));
    const { client } = await connected(host.endpoint);
    let answered = false;
    const first = client.request({ type: "session.open", journey: "garden" }).then((result) => {
      answered = true;
      return result;
    });
    await vi.waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));
    expect(answered).toBe(false);

    host.heldOpen("garden").release();
    await expect(first).resolves.toMatchObject({ sessionId: "session-1", journey: "garden" });
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toMatchObject({ sessionId: "session-2" });
  });

  it("refuses to release an open that is not held", () => {
    const host = serveFakeHost(world({ heldOpens: ["garden"] }));
    expect(() => host.heldOpen("garden")).toThrow("No session.open for garden is held: send in it first.");
    endFakeHosts();
    take();
  });

  it("records an open held and never released, or scripted to be held and never asked for", async () => {
    const host = serveFakeHost(world({ heldOpens: ["garden"] }));
    const { client } = await connected(host.endpoint);
    void client.request({ type: "session.open", journey: "garden" });
    await vi.waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));
    endFakeHosts();
    serveFakeHost(world({ heldOpens: ["garden"] }));
    endFakeHosts();
    expect(take().map((violation) => violation.detail)).toEqual([
      "the session.open held for garden was never released",
      "the session.open scripted to be held for garden was never sent",
    ]);
  });

  it("refuses to hold an open for a Journey that cannot be opened", () => {
    expect(() => serveFakeHost(world({ heldOpens: ["attic"] }))).toThrow(
      'The fake host\'s world: heldOpens holds "attic", a Journey with no project path',
    );
  });
});

describe("the fake host's other answers", () => {
  it("lists the world's providers for a sign-in panel, none when it has none", async () => {
    const provider = { id: "anthropic", name: "Anthropic", apiKey: { label: "API key" } };
    const host = serveFakeHost(world({ providers: [provider] }));
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "auth.providers" })).resolves.toEqual({ type: "auth.providers", providers: [provider] });
    const bare = serveFakeHost(world());
    const other = await connected(bare.endpoint);
    await expect(other.client.request({ type: "auth.providers" })).resolves.toEqual({ type: "auth.providers", providers: [] });
  });

  it("says a Journey's session runs where the world says, when not at its listed path", async () => {
    const host = serveFakeHost(world({ sessionCwds: { garden: "/Users/test/gardens/garden" } }));
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toMatchObject({
      cwd: "/Users/test/gardens/garden",
    });
  });
});

describe("the fake host and a running turn", () => {
  /** A turn that takes a steer between a tool call and its second answer. */
  const steered = (prompt: string, steer: string): SessionEvent[] => [
    { type: "agent_start" },
    { type: "message_start", role: "user" },
    { type: "message_end", role: "user", text: prompt },
    { type: "message_start", role: "assistant" },
    { type: "text_delta", delta: "Looking." },
    { type: "message_end", role: "assistant", text: "Looking.", stopReason: "toolUse" },
    { type: "tool_start", toolCallId: "call-1", toolName: "bash", args: { command: "ls" } },
    { type: "tool_end", toolCallId: "call-1", toolName: "bash", isError: false, resultText: "beds" },
    { type: "message_start", role: "toolResult" },
    { type: "message_end", role: "toolResult", text: "beds" },
    { type: "message_start", role: "user" },
    { type: "message_end", role: "user", text: steer },
    { type: "message_start", role: "assistant" },
    { type: "text_delta", delta: "Beds." },
    { type: "message_end", role: "assistant", text: "Beds.", stopReason: "stop" },
    { type: "agent_end" },
    { type: "agent_settled", aborted: false },
  ];
  const queueUpdate = (steering: string[], followUp: string[] = []) => ({ type: "queue_update", steering, followUp });
  const sessionEvents = (events: HostEvent[]) => events.flatMap((event) => (event.type === "session.event" ? [event.event] : []));

  async function answering(turn: SessionEvent[], overrides: Partial<World> = {}) {
    const host = serveFakeHost(world({ turns: [{ prompt: "Hello", events: turn, held: true }], ...overrides }));
    const { client, events } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    return { host, client, events };
  }

  it("queues a steer or a follow-up while a turn answers, telling the queue before the answer, and plays nothing for it", async () => {
    const { host, client, events } = await answering(answer("Hello"));
    await expect(
      client.request({ type: "session.prompt", sessionId: "session-1", text: "Keep it short", streamingBehavior: "steer" }),
    ).resolves.toEqual({ type: "session.prompt", sessionId: "session-1", disposition: "queued" });
    expect(sessionEvents(events)).toEqual([queueUpdate(["Keep it short"])]);

    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Then say done", streamingBehavior: "followUp" });
    expect(sessionEvents(events).at(-1)).toEqual(queueUpdate(["Keep it short"], ["Then say done"]));
    expect(host.heldTurn().remaining).toBe(answer("Hello").length);

    await client.request({ type: "session.abort", sessionId: "session-1" });
  });

  it("refuses a prompt with neither while a turn answers, as the real host does", async () => {
    const { host, client } = await answering(answer("Hello"));
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "Again" })).rejects.toMatchObject({
      code: "session_busy",
    });
    host.heldTurn().release();
    expect(take()).toEqual([]);
  });

  it("starts the next turn with a steer that arrives while nothing answers, as Pi does", async () => {
    const host = serveFakeHost(world(withHello()));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(
      client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello", streamingBehavior: "steer" }),
    ).resolves.toMatchObject({ disposition: "started" });
  });

  it("delivers a queued message where the turn says, the queue told first, and records one never queued", async () => {
    const { host, client, events } = await answering(steered("Hello", "Keep it short"));
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Keep it short", streamingBehavior: "steer" });
    host.heldTurn().release();
    await vi.waitFor(() => expect(sessionEvents(events).at(-1)).toEqual({ type: "agent_settled", aborted: false }));
    const played = sessionEvents(events);
    const delivery = played.findIndex((event) => event.type === "message_end" && event.role === "user" && event.text === "Keep it short");
    expect(played.slice(delivery - 2, delivery + 1)).toEqual([
      queueUpdate([]),
      { type: "message_start", role: "user" },
      { type: "message_end", role: "user", text: "Keep it short" },
    ]);
    expect(take()).toEqual([]);

    const unqueued = await answering(steered("Hello", "Unqueued"));
    unqueued.host.heldTurn().release();
    expect(take()).toEqual([{ kind: "unscripted", detail: 'the turn delivers "Unqueued", which was never queued' }]);
  });

  it("records a turn that settles with a message still queued, which Pi would have delivered first", async () => {
    const { host, client } = await answering(answer("Hello"));
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "More", streamingBehavior: "followUp" });
    host.heldTurn().release();
    expect(take()).toEqual([{ kind: "unscripted", detail: 'the turn settled with "More" still queued, which Pi delivers before it settles' }]);
  });

  it("stops a held turn as Pi does: the queue withdrawn, the answer ended where it was, the run settled aborted, then the answer", async () => {
    const { host, client, events } = await answering(answer("Hello"));
    host.heldTurn().releaseThrough((event) => event.type === "text_delta");
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "a", streamingBehavior: "steer" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "b", streamingBehavior: "followUp" });
    const before = sessionEvents(events).length;

    await expect(client.request({ type: "session.abort", sessionId: "session-1" })).resolves.toEqual({
      type: "session.abort",
      sessionId: "session-1",
      withdrawn: { steering: ["a"], followUp: ["b"] },
    });
    expect(sessionEvents(events).slice(before)).toEqual([
      queueUpdate([]),
      { type: "message_end", role: "assistant", text: "Tides ", stopReason: "aborted", errorMessage: "Request was aborted" },
      { type: "agent_end" },
      { type: "agent_settled", aborted: true },
    ]);
    expect(host.heldTurn().remaining).toBe(0);
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "c", streamingBehavior: "steer" })).rejects.toThrow(
      /no scripted turn is left/,
    );
    take();
    endFakeHosts();
    expect(take()).toEqual([]);
  });

  it("stops a turn during a tool call with the tool's error, then an empty stopped answer where the next would be", async () => {
    const { host, client, events } = await answering(loadTurn("tool-use").map((event) => (event.type === "message_end" && event.role === "user" ? { ...event, text: "Hello" } : event)));
    host.heldTurn().releaseThrough((event) => event.type === "tool_start");
    await vi.waitFor(() => expect(sessionEvents(events).at(-1)?.type).toBe("tool_start"));
    const before = sessionEvents(events).length;
    await client.request({ type: "session.abort", sessionId: "session-1" });
    expect(sessionEvents(events).slice(before)).toEqual([
      queueUpdate([]),
      { type: "tool_end", toolCallId: "call-1", toolName: "bash", isError: true, resultText: "Operation aborted" },
      { type: "message_start", role: "toolResult" },
      { type: "message_end", role: "toolResult", text: "Operation aborted" },
      { type: "message_start", role: "assistant" },
      { type: "message_end", role: "assistant", text: "", stopReason: "aborted", errorMessage: "Request was aborted" },
      { type: "agent_end" },
      { type: "agent_settled", aborted: true },
    ]);
  });

  it("stops a turn before its answer began with an empty stopped answer, and one whose answer ended with none", async () => {
    const early = await answering(answer("Hello"));
    early.host.heldTurn().releaseThrough((event) => event.type === "message_end");
    await early.client.request({ type: "session.abort", sessionId: "session-1" });
    expect(sessionEvents(early.events).slice(-4)).toEqual([
      { type: "message_start", role: "assistant" },
      { type: "message_end", role: "assistant", text: "", stopReason: "aborted", errorMessage: "Request was aborted" },
      { type: "agent_end" },
      { type: "agent_settled", aborted: true },
    ]);

    const late = await answering(answer("Hello"));
    late.host.heldTurn().releaseThrough((event) => event.type === "agent_end");
    await vi.waitFor(() => expect(sessionEvents(late.events).at(-1)?.type).toBe("agent_end"));
    const before = sessionEvents(late.events).length;
    await late.client.request({ type: "session.abort", sessionId: "session-1" });
    expect(sessionEvents(late.events).slice(before)).toEqual([queueUpdate([]), { type: "agent_settled", aborted: true }]);
  });

  it("answers a stop on a session that is not answering with nothing withdrawn, and plays nothing", async () => {
    const host = serveFakeHost(world());
    const { client, events } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.abort", sessionId: "session-1" })).resolves.toEqual({
      type: "session.abort",
      sessionId: "session-1",
      withdrawn: { steering: [], followUp: [] },
    });
    expect(sessionEvents(events)).toEqual([queueUpdate([])]);
  });

  it("writes to its disk what a stopped turn played, and the messages it delivered, not what was scripted", async () => {
    const { host, client } = await answering(steered("Hello", "Keep it short"));
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Keep it short", streamingBehavior: "steer" });
    host.heldTurn().releaseThrough((event) => event.type === "text_delta" && event.delta === "Beds.");
    await client.request({ type: "session.abort", sessionId: "session-1" });
    const read = await client.request({ type: "session.transcript", journey: "garden", sessionFile: "/Users/test/.pi/agent/sessions/session-1.jsonl" });
    expect(read).toMatchObject({
      entries: [
        { kind: "user", text: "Hello" },
        { kind: "assistant", text: "Looking.", stopReason: "toolUse" },
        { kind: "tool", toolCallId: "call-1", result: "beds" },
        { kind: "user", text: "Keep it short" },
        { kind: "assistant", text: "Beds.", stopReason: "aborted", errorMessage: "Request was aborted" },
      ],
    });
  });

  it("answers a prompt a turn handles without a run as handled, and plays nothing", async () => {
    const host = serveFakeHost(world({ turns: [{ prompt: "/report", events: [], handled: true }] }));
    const { client, events } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "/report" })).resolves.toMatchObject({
      disposition: "handled",
    });
    expect(events).toEqual([]);
    expect(() => serveFakeHost(world({ turns: [{ prompt: "Hello", events: answer("Hello"), handled: true }] }))).toThrow(
      'The fake host\'s world: turns[0] is handled without a run, so it plays no events',
    );
  });

  it("fails a prompt as scripted for a Journey until the test stops it", async () => {
    const refused = { code: "prompt_refused", message: "No model is selected for this session." } as const;
    const host = serveFakeHost(world({ ...withHello(), failures: [{ request: "session.prompt", journey: "garden", error: refused }] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" })).rejects.toMatchObject(refused);
    host.stopFailing("session.prompt", "garden");
    await expect(client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" })).resolves.toMatchObject({
      disposition: "started",
    });
  });

  it("records queued text the fixture net refuses", async () => {
    const { client } = await answering(answer("Hello"));
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "see /Users/someone/notes", streamingBehavior: "steer" });
    await client.request({ type: "session.abort", sessionId: "session-1" });
    expect(take()).toEqual([
      { kind: "unscripted", detail: "session.prompt queued text the fixture net refuses: a home directory other than /Users/test/" },
    ]);
  });
});

describe("the fake host going away", () => {
  it("drops every connection as a dying process does, refuses the next, and settles what it held", async () => {
    const host = serveFakeHost(world({ heldOpens: ["garden"] }));
    const raw = await rawSocket(urlOf(host.endpoint));
    const { client } = await connected(host.endpoint);
    const unclean: boolean[] = [];
    raw.socket.addEventListener("close", (event) => unclean.push(!(event as CloseEvent).wasClean));
    // The open it holds is never answered: the client fails it by the connection's loss. Its
    // expectation is attached now, before the loss, or the rejection would go unhandled.
    const open = expect(client.request({ type: "session.open", journey: "garden" })).rejects.toMatchObject({ code: "connection_lost" });
    await vi.waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));

    host.goAway();
    await vi.waitFor(() => expect(raw.closes).toEqual([1006]));
    expect(unclean).toEqual([true]);
    await open;
    await expect(HostClient.connect(host.endpoint)).rejects.toThrow("The host did not accept the connection.");

    endFakeHosts();
    expect(take()).toEqual([]);
  });
});

describe("the fake host's sessions on disk", () => {
  const folder = "/Users/test/.pi/agent/sessions/--Users-test-garden--";
  const tomatoes: ScriptedSession = {
    file: `${folder}/tomatoes.jsonl`,
    id: "garden-tomatoes",
    title: "Plant the tomatoes",
    created: Date.UTC(2025, 9, 29, 9),
    modified: Date.UTC(2025, 9, 29, 10),
    entries: [
      { kind: "user", text: "Plant the tomatoes" },
      { kind: "assistant", text: "Planted in the north bed.", thinking: "", stopReason: "stop" },
    ],
    earlier: 3,
  };
  const roses: ScriptedSession = {
    file: `${folder}/roses.jsonl`,
    id: "garden-roses",
    title: "Prune the roses",
    created: Date.UTC(2025, 9, 20, 9),
    modified: Date.UTC(2025, 9, 20, 10),
    entries: [{ kind: "user", text: "Prune the roses" }],
  };
  const withSessions = (overrides: Partial<World> = {}) => world({ sessions: { garden: [roses, tomatoes] }, ...overrides });
  const summary = ({ file, id, title, created, modified }: ScriptedSession) => ({ file, id, title, created, modified });

  it("lists a Journey's sessions newest first, and none for a Journey that has none", async () => {
    const host = serveFakeHost(
      withSessions({ journeys: [...world().journeys, { id: "beds", name: "Beds", status: "active", description: "", projectPath: "/Users/test/beds" }] }),
    );
    const { client } = await connected(host.endpoint);

    const defaults = { model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "medium" };
    await expect(client.request({ type: "sessions.list", journey: "garden" })).resolves.toEqual({
      type: "sessions.list",
      journey: "garden",
      sessions: [summary(tomatoes), summary(roses)],
      defaults,
    });
    await expect(client.request({ type: "sessions.list", journey: "beds" })).resolves.toEqual({ type: "sessions.list", journey: "beds", sessions: [], defaults });
  });

  it("reads a session's transcript, and refuses a file that is not one of the Journey's as the real host does, recording it", async () => {
    const host = serveFakeHost(withSessions());
    const { client } = await connected(host.endpoint);

    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: tomatoes.file })).resolves.toEqual({
      type: "session.transcript",
      sessionFile: tomatoes.file,
      entries: tomatoes.entries,
      earlier: 3,
      resumes: { model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "medium" },
    });
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: `${folder}/other.jsonl` })).rejects.toMatchObject({
      code: "session_open_failed",
      message: "That file is not one of the Journey's sessions.",
    });
    expect(take()).toEqual([{ kind: "unscripted", detail: expect.stringContaining("not one of garden's sessions") }]);
  });

  it("resumes a session by its file, under the session's own id", async () => {
    const host = serveFakeHost(withSessions());
    const { client } = await connected(host.endpoint);

    await expect(client.request({ type: "session.open", journey: "garden", sessionFile: roses.file })).resolves.toMatchObject({
      sessionId: "garden-roses",
      sessionFile: roses.file,
      journey: "garden",
    });
  });

  it("closes the Journey's open session when it opens another, and refuses while that one answers", async () => {
    const host = serveFakeHost(withSessions({ turns: [{ prompt: "Hello", events: answer("Hello"), held: true }] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });

    await expect(client.request({ type: "session.open", journey: "garden", sessionFile: tomatoes.file })).rejects.toMatchObject({
      code: "session_busy",
    });
    expect(host.closedSessions).toEqual([]);

    host.heldTurn().release();
    await expect(client.request({ type: "session.open", journey: "garden", sessionFile: tomatoes.file })).resolves.toMatchObject({
      sessionId: "garden-tomatoes",
    });
    expect(host.closedSessions).toEqual(["session-1"]);
  });

  it("refuses a file another Journey has open", async () => {
    const beds = { id: "beds", name: "Beds", status: "active", description: "", projectPath: "/Users/test/garden" };
    const host = serveFakeHost(withSessions({ journeys: [...world().journeys, beds], sessions: { garden: [tomatoes], beds: [tomatoes] } }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden", sessionFile: tomatoes.file });

    await expect(client.request({ type: "session.open", journey: "beds", sessionFile: tomatoes.file })).rejects.toMatchObject({
      code: "session_open_failed",
      message: "That session is already open in this app.",
    });
  });

  it("lists a new session once its first prompt is played, titled by it, and reads it back", async () => {
    const host = serveFakeHost(withSessions(withHello()));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    // Not listed yet: Pi writes a session's file only with its first message.
    await expect(client.request({ type: "sessions.list", journey: "garden" })).resolves.toMatchObject({ sessions: [{ id: "garden-tomatoes" }, { id: "garden-roses" }] });

    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    const listed = await client.request({ type: "sessions.list", journey: "garden" });
    expect(listed).toMatchObject({ sessions: [{ id: "session-1", title: "Hello", file: "/Users/test/.pi/agent/sessions/session-1.jsonl" }, { id: "garden-tomatoes" }, { id: "garden-roses" }] });
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: "/Users/test/.pi/agent/sessions/session-1.jsonl" })).resolves.toMatchObject({
      entries: [
        { kind: "user", text: "Hello" },
        { kind: "assistant", text: "Tides turn.", thinking: "", stopReason: "stop" },
      ],
      earlier: 0,
    });
  });

  it("fails the reads of a scripted Journey until the test stops them", async () => {
    const unreadable = { code: "sessions_unreadable", message: "The session folder could not be read: permission denied." } as const;
    const host = serveFakeHost(
      withSessions({
        failures: [
          { request: "sessions.list", journey: "garden", error: unreadable },
          { request: "session.transcript", journey: "garden", error: unreadable },
        ],
      }),
    );
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "sessions.list", journey: "garden" })).rejects.toThrow(unreadable.message);
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: roses.file })).rejects.toThrow(unreadable.message);

    host.stopFailing("sessions.list", "garden");
    host.stopFailing("session.transcript", "garden");
    await expect(client.request({ type: "sessions.list", journey: "garden" })).resolves.toMatchObject({ type: "sessions.list" });
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: roses.file })).resolves.toMatchObject({ type: "session.transcript" });
    expect(take()).toEqual([]);
  });

  it("refuses a world whose sessions break the protocol, carry real paths or secrets, or name a Journey it cannot list", () => {
    expect(() => serveFakeHost(world({ sessions: { garden: [{ ...roses, created: Number.NaN }] } }))).toThrow(/sessions\.garden\[0\]/);
    expect(() => serveFakeHost(world({ sessions: { garden: [{ ...roses, file: "/Users/someone/.pi/roses.jsonl" }] } }))).toThrow(
      /sessions\.garden\[0\]: a home directory other than \/Users\/test\//,
    );
    expect(() =>
      serveFakeHost(world({ sessions: { garden: [{ ...roses, entries: [{ kind: "user", text: "sk-ant-abcdefghijkl" }] }] } })),
    ).toThrow(/an API key/);
    expect(() => serveFakeHost(world({ sessions: { attic: [roses] } }))).toThrow(/sessions names "attic"/);
  });
});

describe("the fake host and a session's model and thinking", () => {
  const test = world().models[0]!;
  const deep = { provider: "anthropic", id: "claude-deep", name: "Claude Deep", reasoning: true, thinkingLevels: ["low", "medium", "high", "xhigh", "max"] };
  const testRef = { provider: "anthropic", id: "claude-test" };
  const deepRef = { provider: "anthropic", id: "claude-deep" };
  const folder = "/Users/test/.pi/agent/sessions/--Users-test-garden--";
  const deepSession: ScriptedSession = {
    file: `${folder}/deep.jsonl`,
    id: "garden-deep",
    title: "Dig deep",
    created: Date.UTC(2025, 9, 29, 9),
    modified: Date.UTC(2025, 9, 29, 10),
    entries: [{ kind: "user", text: "Dig deep" }],
    model: deepRef,
    thinkingLevel: "xhigh",
  };
  const plainSession: ScriptedSession = { ...deepSession, file: `${folder}/plain.jsonl`, id: "garden-plain", model: undefined, thinkingLevel: undefined };
  const farSession: ScriptedSession = { ...deepSession, file: `${folder}/far.jsonl`, id: "garden-far", model: { provider: "faraway", id: "far-1" }, thinkingLevel: "max" };
  const models = (overrides: Partial<World> = {}) =>
    world({ models: [test, deep], sessions: { garden: [deepSession, plainSession, farSession] }, ...overrides });

  it("says what a new session in each Journey starts with: the world's, else its first model at medium", async () => {
    const beds = { id: "beds", name: "Beds", status: "active", description: "", projectPath: "/Users/test/beds" };
    const host = serveFakeHost(models({ journeys: [...world().journeys, beds], defaults: { garden: { model: deepRef, thinkingLevel: "high" } } }));
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "sessions.list", journey: "garden" })).resolves.toMatchObject({ defaults: { model: deepRef, thinkingLevel: "high" } });
    await expect(client.request({ type: "sessions.list", journey: "beds" })).resolves.toMatchObject({ defaults: { model: testRef, thinkingLevel: "medium" } });
  });

  it("says what resuming a file starts with: its own model and level, the defaults where it has none, the default model where Pi cannot use its own", async () => {
    const host = serveFakeHost(models());
    const { client } = await connected(host.endpoint);
    const resumes = async (file: string) => (await client.request({ type: "session.transcript", journey: "garden", sessionFile: file })) as { resumes: unknown };
    expect((await resumes(deepSession.file)).resumes).toEqual({ model: deepRef, thinkingLevel: "xhigh" });
    expect((await resumes(plainSession.file)).resumes).toEqual({ model: testRef, thinkingLevel: "medium" });
    // Its own level, clamped to the model it falls back to.
    expect((await resumes(farSession.file)).resumes).toEqual({ model: testRef, thinkingLevel: "high" });
  });

  it("opens a new session on the person's choice, or on the defaults, and its file records what it started on", async () => {
    const host = serveFakeHost(models({ turns: [{ prompt: "Hello", events: answer("Hello") }] }));
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden", model: deepRef, thinkingLevel: "low" })).resolves.toMatchObject({
      model: deepRef,
      thinkingLevel: "low",
      diagnostics: [],
    });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: "/Users/test/.pi/agent/sessions/session-1.jsonl" })).resolves.toMatchObject({
      resumes: { model: deepRef, thinkingLevel: "low" },
    });
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toMatchObject({ model: testRef, thinkingLevel: "medium" });
  });

  it("resumes a file on its own model, or on the person's choice, which its file then records", async () => {
    const host = serveFakeHost(models());
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden", sessionFile: deepSession.file })).resolves.toMatchObject({
      model: deepRef,
      thinkingLevel: "xhigh",
    });
    await expect(
      client.request({ type: "session.open", journey: "garden", sessionFile: plainSession.file, model: deepRef, thinkingLevel: "max" }),
    ).resolves.toMatchObject({ model: deepRef, thinkingLevel: "max", diagnostics: [] });
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: plainSession.file })).resolves.toMatchObject({
      resumes: { model: deepRef, thinkingLevel: "max" },
    });
  });

  it("says Pi's line where a resumed file's model could not be restored, unless the person picked over it", async () => {
    const host = serveFakeHost(models());
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden", sessionFile: farSession.file })).resolves.toMatchObject({
      model: testRef,
      thinkingLevel: "high",
      diagnostics: ["Could not restore model faraway/far-1. Using anthropic/claude-test"],
    });
    await expect(
      client.request({ type: "session.open", journey: "garden", sessionFile: farSession.file, model: deepRef, thinkingLevel: "high" }),
    ).resolves.toMatchObject({ model: deepRef, diagnostics: [] });
  });

  it("changes an open session's model and level, answering what it runs on after, at once even while a turn answers", async () => {
    const host = serveFakeHost(models({ turns: [{ prompt: "Hello", events: answer("Hello"), held: true }] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden", sessionFile: deepSession.file });
    await client.request({ type: "session.prompt", sessionId: "garden-deep", text: "Hello" });
    await expect(client.request({ type: "session.configure", sessionId: "garden-deep", model: testRef, thinkingLevel: "low" })).resolves.toEqual({
      type: "session.configure",
      sessionId: "garden-deep",
      model: testRef,
      thinkingLevel: "low",
    });
    host.heldTurn().release();
    await expect(client.request({ type: "session.transcript", journey: "garden", sessionFile: deepSession.file })).resolves.toMatchObject({
      resumes: { model: testRef, thinkingLevel: "low" },
    });
    expect(host.requestsOf("session.configure")).toEqual([{ type: "session.configure", sessionId: "garden-deep", model: testRef, thinkingLevel: "low" }]);
  });

  it("refuses a model the world does not list, as the real host refuses one Pi cannot use, before anything closes", async () => {
    const host = serveFakeHost(models());
    const { client } = await connected(host.endpoint);
    const far = { provider: "faraway", id: "far-1" };
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.open", journey: "garden", model: far, thinkingLevel: "low" })).rejects.toMatchObject({
      code: "model_not_available",
      message: "Pi knows no model faraway/far-1.",
    });
    expect(host.closedSessions).toEqual([]);
    await expect(client.request({ type: "session.configure", sessionId: "session-1", model: far, thinkingLevel: "low" })).rejects.toMatchObject({
      code: "model_not_available",
    });
    expect(take()).toEqual([]);
  });

  it("records a level the model does not list, and a change without its pair: the UI offers only a model's levels, and sends both", async () => {
    const host = serveFakeHost(models());
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden", model: deepRef, thinkingLevel: "off" });
    await client.request({ type: "session.configure", sessionId: "session-1", model: testRef, thinkingLevel: "xhigh" });
    await client.request({ type: "session.configure", sessionId: "session-1", thinkingLevel: "low" });
    await client.request({ type: "session.configure", sessionId: "session-1", model: deepRef });
    expect(take().map((violation) => violation.detail)).toEqual([
      "session.open asked off of anthropic/claude-deep, which lists low, medium, high, xhigh, max: the UI offers only a model's own levels",
      "session.configure asked xhigh of anthropic/claude-test, which lists off, minimal, low, medium, high: the UI offers only a model's own levels",
      "session.configure without a model: the UI sends the model and its level together",
      "session.configure without a level: the UI sends the model and its level together",
    ]);
  });

  it("holds a session.configure until the test releases it, and records one held and never released", async () => {
    const host = serveFakeHost(models({ heldConfigures: ["garden"] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    let answered = false;
    const change = client.request({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "high" }).then((result) => {
      answered = true;
      return result;
    });
    await vi.waitFor(() => expect(host.requestsOf("session.configure")).toHaveLength(1));
    expect(answered).toBe(false);
    host.heldConfigure("garden").release();
    await expect(change).resolves.toMatchObject({ model: deepRef, thinkingLevel: "high" });

    const other = serveFakeHost(models({ heldConfigures: ["garden"] }));
    const second = await connected(other.endpoint);
    await second.client.request({ type: "session.open", journey: "garden" });
    void second.client.request({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "high" });
    await vi.waitFor(() => expect(other.requestsOf("session.configure")).toHaveLength(1));
    endFakeHosts();
    expect(take().map((violation) => violation.detail)).toEqual(["the session.configure held for garden was never released"]);
  });

  it("fails a session.configure as scripted for a Journey until the test stops it", async () => {
    const refused = { code: "model_not_available", message: "No credential for anthropic: sign in first." } as const;
    const host = serveFakeHost(models({ failures: [{ request: "session.configure", journey: "garden", error: refused }] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await expect(client.request({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "high" })).rejects.toThrow(refused.message);
    host.stopFailing("session.configure", "garden");
    await expect(client.request({ type: "session.configure", sessionId: "session-1", model: deepRef, thinkingLevel: "high" })).resolves.toMatchObject({ model: deepRef });
  });

  it("refuses a world whose defaults or sessions break the protocol, or name a Journey it does not have", () => {
    expect(() => serveFakeHost(models({ defaults: { garden: { thinkingLevel: "" } } }))).toThrow(/defaults\.garden/);
    expect(() => serveFakeHost(models({ defaults: { nowhere: { thinkingLevel: "medium" } } }))).toThrow(/defaults names "nowhere"/);
    expect(() => serveFakeHost(models({ sessions: { garden: [{ ...deepSession, thinkingLevel: "" }] } }))).toThrow(/sessions\.garden\[0\]/);
    expect(() => serveFakeHost(models({ heldConfigures: ["attic"] }))).toThrow(/heldConfigures holds "attic"/);
  });
});
