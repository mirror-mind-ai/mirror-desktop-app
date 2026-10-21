// The fake host: the protocol server UI tests run against.
//
// A test scripts a world (the host's identity, models, Journeys and the turns
// to play) and serves it. The UI then reaches it through the same two doors it
// uses to reach the real host: Tauri's `host_endpoint` command (answered by the
// IPC door) and a WebSocket to the port it returns (a FakeSocket). App and
// HostClient run unchanged.
//
// It follows the real host (packages/host/src/server.ts), because a test double
// proves something only where it is faithful:
//
// - hello comes first, with the endpoint's exact token and PROTOCOL_VERSION;
//   anything else is answered as the real host answers it, and recorded;
// - session events go to every open, authenticated connection, which is how a
//   second StrictMode connection once rendered every delta twice;
// - every request is checked against ClientRequest, every message it sends
//   against HostMessage, and the world against the protocol before any test
//   runs on it.
//
// What the world does not script (an unknown Journey or session, a turn that is
// not next, a request type TS1 does not answer) is answered at once with a named
// error and recorded, so a test never waits on a reply that will not come. The
// story that first needs one of the real host's error answers adds it.

import {
  AvailableModel,
  ClientRequest,
  type ClientRequestBody,
  type HostError,
  type HostEvent,
  HostIdentity,
  HostMessage,
  Journey,
  PROTOCOL_VERSION,
  type SessionEvent,
} from "@mirror-desktop/protocol";

import { listen, type ServerSide, type SocketPeer, type SocketServer } from "./fakeSocket.ts";
import { scriptIpc } from "./ipcDoor.ts";
import { log } from "./traffic.ts";
import { parseTurn } from "./turns.ts";
import { record } from "./violations.ts";

export interface ScriptedTurn {
  /** The prompt this turn answers. A prompt with any other text is a violation. */
  readonly prompt: string;
  /** What the host plays after answering the prompt: a fixture from loadTurn(), or events written inline. */
  readonly events: readonly SessionEvent[];
  /** Hold the events until the test releases them, to watch the stream and the running state. */
  readonly held?: boolean;
}

export interface World {
  /** What the host says it is made of; a fixed identity when omitted. */
  readonly identity?: HostIdentity;
  readonly models: readonly AvailableModel[];
  readonly journeys: readonly Journey[];
  /** Played in order, one per prompt. A turn never prompted fails the test. */
  readonly turns: readonly ScriptedTurn[];
}

/** A turn whose events wait for the test. */
export interface HeldTurn {
  readonly remaining: number;
  /** Send every event left. */
  release(): void;
  /** Send the events up to and including the first that matches. */
  releaseThrough(match: (event: SessionEvent) => boolean): void;
}

type SessionOpen = Extract<ClientRequestBody, { type: "session.open" }>;
type SessionPrompt = Extract<ClientRequestBody, { type: "session.prompt" }>;

interface Connection {
  readonly side: ServerSide;
  authenticated: boolean;
}

const DEFAULT_IDENTITY: HostIdentity = {
  instanceId: "fake-host-1",
  protocolVersion: PROTOCOL_VERSION,
  node: "v24.0.0",
  pi: "0.0.0-fake",
  mirror: "0.0.0-fake",
};

/** A fixed clock: session events are stamped in order, the same way every run. */
const CLOCK_START = Date.UTC(2026, 0, 1);

const served = new Set<FakeHost>();

/** Serve `world` to the UI: listen on its endpoint and answer `host_endpoint` with it. */
export function serveFakeHost(world: World): FakeHost {
  const host = new FakeHost(world);
  listen(`ws://127.0.0.1:${host.endpoint.port}`, host);
  scriptIpc("host_endpoint", () => host.endpoint);
  served.add(host);
  return host;
}

/** End every host served this test, recording the turns it never played. Owned by the UI setup. */
export function endFakeHosts(): void {
  for (const host of served) host.checkTurnsPlayed();
  served.clear();
}

/** Why `message` breaks the protocol, or null when it does not. */
export function outboundProblem(message: unknown): string | null {
  const parsed = HostMessage.safeParse(message);
  if (parsed.success) return null;
  const sent = message as { id?: unknown; result?: { type?: unknown }; type?: unknown };
  const what =
    typeof sent.id === "string"
      ? `the reply to request ${sent.id} (${String(sent.result?.type ?? "error")})`
      : `the event ${String(sent.type)}`;
  return `${what} breaks the protocol: ${issueText(parsed.error.issues[0])}`;
}

function issueText(issue: { path: PropertyKey[]; message: string } | undefined): string {
  if (!issue) return "it does not match the protocol";
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** The world, checked before any test runs on it; the identity the host will report. */
function checkWorld(world: World): HostIdentity {
  const fail = (where: string, issue: { path: PropertyKey[]; message: string } | undefined) => {
    const path = issue?.path.length ? `${where}.${issue.path.map(String).join(".")}` : where;
    return new Error(`The fake host's world: ${path}: ${issue?.message ?? "does not match the protocol"}`);
  };
  const identity = HostIdentity.safeParse(world.identity ?? DEFAULT_IDENTITY);
  if (!identity.success) throw fail("identity", identity.error.issues[0]);
  world.models.forEach((model, index) => {
    const parsed = AvailableModel.safeParse(model);
    if (!parsed.success) throw fail(`models[${index}]`, parsed.error.issues[0]);
  });
  world.journeys.forEach((journey, index) => {
    const parsed = Journey.safeParse(journey);
    if (!parsed.success) throw fail(`journeys[${index}]`, parsed.error.issues[0]);
  });
  world.turns.forEach((turn, index) => {
    parseTurn(`turns[${index}] ("${turn.prompt}")`, turn.events);
    for (const event of turn.events) {
      if (event.type === "message_end" && event.role === "user" && event.text !== turn.prompt) {
        throw new Error(
          `The fake host's world: turns[${index}] is scripted for "${turn.prompt}" but its user message says "${event.text}"`,
        );
      }
    }
  });
  return identity.data;
}

class Held implements HeldTurn {
  readonly #events: SessionEvent[];
  readonly #send: (event: SessionEvent) => void;

  constructor(events: SessionEvent[], send: (event: SessionEvent) => void) {
    this.#events = events;
    this.#send = send;
  }

  get remaining(): number {
    return this.#events.length;
  }

  release(): void {
    for (const event of this.#events.splice(0)) this.#send(event);
  }

  releaseThrough(match: (event: SessionEvent) => boolean): void {
    const index = this.#events.findIndex(match);
    if (index === -1) {
      throw new Error(`The held turn has no event left that matches; ${this.#events.length} event(s) remain.`);
    }
    for (const event of this.#events.splice(0, index + 1)) this.#send(event);
  }
}

export class FakeHost implements SocketServer {
  readonly endpoint = { port: 0, token: "fake-host-token" } as const;
  readonly identity: HostIdentity;
  /** Every request received that the protocol accepts, in order. */
  readonly requests: ClientRequestBody[] = [];
  readonly #world: World;
  readonly #turns: { readonly turn: ScriptedTurn; played: boolean }[];
  readonly #connections = new Set<Connection>();
  readonly #sessions = new Map<string, string>();
  #held: Held | null = null;
  #clock = CLOCK_START;

  constructor(world: World) {
    this.identity = checkWorld(world);
    this.#world = world;
    this.#turns = world.turns.map((turn) => ({ turn, played: false }));
  }

  requestsOf<T extends ClientRequestBody["type"]>(type: T): Extract<ClientRequestBody, { type: T }>[] {
    return this.requests.filter((request): request is Extract<ClientRequestBody, { type: T }> => request.type === type);
  }

  /** The turn the last prompt started, while it holds its events back. */
  heldTurn(): HeldTurn {
    if (!this.#held) throw new Error("No turn is held: script one with held: true and send its prompt first.");
    return this.#held;
  }

  checkTurnsPlayed(): void {
    for (const { turn, played } of this.#turns) {
      if (!played) record("unscripted", `the turn scripted for "${turn.prompt}" was never played`);
    }
  }

  accept(side: ServerSide): SocketPeer {
    const connection: Connection = { side, authenticated: false };
    this.#connections.add(connection);
    return {
      receive: (frame) => this.#receive(connection, frame),
      closed: () => this.#connections.delete(connection),
    };
  }

  #receive(connection: Connection, frame: string): void {
    const socket = `#${connection.side.id}`;
    let data: unknown;
    try {
      data = JSON.parse(frame);
    } catch {
      log(`${socket} → a frame that is not JSON`);
      record("protocol", `socket ${socket} sent a frame that is not JSON: ${frame.slice(0, 80)}`);
      this.#malformed(connection);
      return;
    }
    const parsed = ClientRequest.safeParse(data);
    if (!parsed.success) {
      const type = (data as { request?: { type?: unknown } } | null)?.request?.type;
      const what = typeof type === "string" ? `a ${type} request` : "a request";
      log(`${socket} → ${what} that breaks the protocol`);
      record("protocol", `socket ${socket} sent ${what} that breaks the protocol: ${issueText(parsed.error.issues[0])}`);
      this.#malformed(connection);
      return;
    }
    const { id, request } = parsed.data;
    log(`${socket} → ${request.type} (request ${id})`);
    this.requests.push(request);
    this.#handle(connection, id, request);
  }

  #handle(connection: Connection, id: string, request: ClientRequestBody): void {
    if (request.type === "hello") {
      if (request.token !== this.endpoint.token) {
        record("handshake", "hello with a token that is not the endpoint's");
        this.#refuse(connection, id, "unauthorized", "The host did not recognize this token.");
        return;
      }
      if (request.protocolVersion !== PROTOCOL_VERSION) {
        record("handshake", `hello in protocol ${request.protocolVersion}; the fake host speaks ${PROTOCOL_VERSION}`);
        this.#error(
          connection,
          id,
          "unsupported_protocol_version",
          `The host speaks protocol ${PROTOCOL_VERSION}; the client asked for ${request.protocolVersion}.`,
        );
        return;
      }
      connection.authenticated = true;
      this.#reply(connection, { id, result: { type: "hello", host: this.identity } });
      return;
    }
    if (!connection.authenticated) {
      record("handshake", `${request.type} before hello`);
      this.#refuse(connection, id, "unauthorized", "Say hello first.");
      return;
    }
    switch (request.type) {
      case "models.available":
        this.#reply(connection, { id, result: { type: "models.available", models: [...this.#world.models] } });
        return;
      case "journeys.list":
        this.#reply(connection, { id, result: { type: "journeys.list", journeys: [...this.#world.journeys] } });
        return;
      case "session.open":
        this.#open(connection, id, request);
        return;
      case "session.prompt":
        this.#prompt(connection, id, request);
        return;
      default:
        this.#unscripted(connection, id, `${request.type}, which the fake host was not scripted to answer`);
    }
  }

  #open(connection: Connection, id: string, request: SessionOpen): void {
    if (request.journey === undefined) {
      this.#unscripted(connection, id, `session.open for the directory ${request.cwd ?? "?"}, which the fake host does not script`);
      return;
    }
    const journey = this.#world.journeys.find((candidate) => candidate.id === request.journey);
    if (!journey) {
      this.#unscripted(connection, id, `session.open for "${request.journey}", a Journey the world does not have`);
      return;
    }
    if (!journey.projectPath) {
      this.#unscripted(connection, id, `session.open for "${journey.id}", which has no project path`);
      return;
    }
    const number = this.#sessions.size + 1;
    const sessionId = `session-${number}`;
    this.#sessions.set(sessionId, journey.id);
    const model = this.#world.models[0];
    this.#reply(connection, {
      id,
      result: {
        type: "session.open",
        sessionId,
        sessionFile: `/Users/test/.pi/agent/sessions/${sessionId}.jsonl`,
        cwd: request.cwd ?? journey.projectPath,
        journey: journey.id,
        mirrorConversationId: `conversation-${number}`,
        ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
        thinkingLevel: "medium",
        diagnostics: [],
      },
    });
  }

  #prompt(connection: Connection, id: string, request: SessionPrompt): void {
    if (!this.#sessions.has(request.sessionId)) {
      this.#unscripted(connection, id, `session.prompt for ${request.sessionId}, a session the fake host never opened`);
      return;
    }
    const next = this.#turns.find((candidate) => !candidate.played);
    if (!next) {
      this.#unscripted(connection, id, `session.prompt "${request.text}": no scripted turn is left`);
      return;
    }
    if (next.turn.prompt !== request.text) {
      this.#unscripted(
        connection,
        id,
        `session.prompt "${request.text}" does not match the next scripted turn, "${next.turn.prompt}"`,
      );
      return;
    }
    next.played = true;
    this.#reply(connection, { id, result: { type: "session.prompt", sessionId: request.sessionId } });
    const events = [...next.turn.events];
    const send = (event: SessionEvent) => this.#broadcast(request.sessionId, event);
    if (next.turn.held) {
      this.#held = new Held(events, send);
      return;
    }
    for (const event of events) send(event);
  }

  /** To every open, authenticated connection, as the real host broadcasts. */
  #broadcast(sessionId: string, event: SessionEvent): void {
    const message: HostEvent = { type: "session.event", sessionId, at: this.#clock++, event };
    const problem = outboundProblem(message);
    if (problem) {
      record("protocol", problem);
      return;
    }
    const targets = [...this.#connections].filter((connection) => connection.authenticated && connection.side.isOpen);
    log(`event ${event.type} → ${targets.map((target) => `#${target.side.id}`).join(", ") || "nobody"}`);
    const frame = JSON.stringify(message);
    for (const target of targets) target.side.send(frame);
  }

  #reply(connection: Connection, message: HostMessage): void {
    const problem = outboundProblem(message);
    if (problem) {
      record("protocol", problem);
      return;
    }
    if ("id" in message) {
      const what = message.result ? message.result.type : `error ${message.error?.code ?? "?"}`;
      log(`#${connection.side.id} ← ${what} (request ${message.id})`);
    }
    if (connection.side.isOpen) connection.side.send(JSON.stringify(message));
  }

  #error(connection: Connection, id: string, code: HostError["code"], message: string): void {
    this.#reply(connection, { id, error: { code, message } });
  }

  /** As the real host does: answer unauthorized, then close with 4401. */
  #refuse(connection: Connection, id: string, code: HostError["code"], message: string): void {
    this.#error(connection, id, code, message);
    connection.side.close(4401, "unauthorized");
    this.#connections.delete(connection);
  }

  /** As the real host does with a request it cannot read: answer with id "?". */
  #malformed(connection: Connection): void {
    this.#reply(connection, { id: "?", error: { code: "malformed_request", message: "The request did not match the protocol." } });
  }

  #unscripted(connection: Connection, id: string, detail: string): void {
    record("unscripted", detail);
    log(`#${connection.side.id} has no script: ${detail}`);
    this.#error(connection, id, "internal_failure", `The fake host has no script for this: ${detail}.`);
  }
}
