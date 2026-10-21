import { type HostEvent, PROTOCOL_VERSION, type SessionEvent } from "@mirror-desktop/protocol";
import { describe, expect, it, vi } from "vitest";

import { HostClient, HostRequestError, hostEndpoint } from "../host/client.ts";
import { endFakeHosts, outboundProblem, serveFakeHost, type World } from "./fakeHost.ts";
import { takeLog } from "./traffic.ts";
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
  models: [{ provider: "anthropic", id: "claude-test", name: "Claude Test", reasoning: true }],
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
    });
    const played = answer("Hello").map((event) => event.type);
    await vi.waitFor(() => expect(eventTypes(first.events)).toEqual(played));
    await vi.waitFor(() => expect(eventTypes(second.events)).toEqual(played));
    expect(first.events.every((event) => event.type === "session.event" && event.sessionId === "session-1")).toBe(true);
    const stamps = first.events.map((event) => (event.type === "session.event" ? event.at : 0));
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
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

  it("answers session.abort for a session it opened, and leaves the turn to play as scripted", async () => {
    const host = serveFakeHost(world({ turns: [{ prompt: "Hello", events: answer("Hello"), held: true }] }));
    const { client } = await connected(host.endpoint);
    await client.request({ type: "session.open", journey: "garden" });
    await client.request({ type: "session.prompt", sessionId: "session-1", text: "Hello" });
    await expect(client.request({ type: "session.abort", sessionId: "session-1" })).resolves.toEqual({
      type: "session.abort",
      sessionId: "session-1",
    });
    expect(host.heldTurn().remaining).toBe(answer("Hello").length);
    host.heldTurn().release();
  });

  it("says a Journey's session runs where the world says, when not at its listed path", async () => {
    const host = serveFakeHost(world({ sessionCwds: { garden: "/Users/test/gardens/garden" } }));
    const { client } = await connected(host.endpoint);
    await expect(client.request({ type: "session.open", journey: "garden" })).resolves.toMatchObject({
      cwd: "/Users/test/gardens/garden",
    });
  });
});
