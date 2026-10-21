// The fake host: the protocol server UI tests run against.
//
// A test scripts a world (the host's identity, models, Journeys, the turns to
// play, and what should fail) and serves it. The UI then reaches it through the
// same two doors it uses to reach the real host: Tauri's `host_endpoint`
// command (answered by the IPC door) and a WebSocket to the port it returns (a
// FakeSocket). App and HostClient run unchanged.
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
// A world can script the real host's failures: `hello`, `journeys.list`, or
// `session.open` for one Journey answer with the scripted HostError until the
// test calls stopFailing(), the way the person fixes something outside the app
// and tries again. A scripted failure is the script, not a violation; one that
// no request ever met is reported when the test ends. A `session.open` can be
// held, like a turn, so a test can watch the screen while a session opens.
//
// `session.abort` is answered for a session the host opened, but its effect is
// not played: the turn plays on as scripted, held or not. The story that needs
// what Stop does to a turn (CV1.DS2.US2) scripts it.
//
// What the world does not script (an unknown Journey or session, a turn that is
// not next, a request type the fake host does not answer) is answered at once
// with a named error and recorded, so a test never waits on a reply that will
// not come.

import {
  AuthProvider,
  AvailableModel,
  ClientRequest,
  type ClientRequestBody,
  HostError,
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

/** A request the host fails with `error`, as the real host would, until the test calls stopFailing(). */
export type ScriptedFailure =
  | { readonly request: "hello" | "journeys.list"; readonly error: HostError }
  | { readonly request: "session.open"; readonly journey: string; readonly error: HostError };

export interface World {
  /** What the host says it is made of; a fixed identity when omitted. */
  readonly identity?: HostIdentity;
  readonly models: readonly AvailableModel[];
  readonly journeys: readonly Journey[];
  /** Played in order, one per prompt. A turn never prompted fails the test. */
  readonly turns: readonly ScriptedTurn[];
  /** What auth.providers lists, for a sign-in panel; none when omitted. */
  readonly providers?: readonly AuthProvider[];
  /** Requests the host fails. One that no request meets fails the test. */
  readonly failures?: readonly ScriptedFailure[];
  /** Journeys whose first session.open is answered only when the test releases it. */
  readonly heldOpens?: readonly string[];
  /** Where session.open says a Journey's session runs, when not at its listed project path. */
  readonly sessionCwds?: Readonly<Record<string, string>>;
}

/** A turn whose events wait for the test. */
export interface HeldTurn {
  readonly remaining: number;
  /** Send every event left. */
  release(): void;
  /** Send the events up to and including the first that matches. */
  releaseThrough(match: (event: SessionEvent) => boolean): void;
}

/** A session.open whose answer waits for the test. */
export interface HeldOpen {
  release(): void;
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

/** End every host served this test, recording what it was scripted to do and never did. Owned by the UI setup. */
export function endFakeHosts(): void {
  for (const host of served) host.checkScriptUsed();
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

function describeFailure(failure: ScriptedFailure): string {
  return failure.request === "session.open" ? `session.open in ${failure.journey}` : failure.request;
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
  world.providers?.forEach((provider, index) => {
    const parsed = AuthProvider.safeParse(provider);
    if (!parsed.success) throw fail(`providers[${index}]`, parsed.error.issues[0]);
  });
  const journeyOf = (id: string) => world.journeys.find((journey) => journey.id === id);
  world.failures?.forEach((failure, index) => {
    const parsed = HostError.safeParse(failure.error);
    if (!parsed.success) throw fail(`failures[${index}].error`, parsed.error.issues[0]);
    if (failure.request === "session.open" && !journeyOf(failure.journey)) {
      throw new Error(`The fake host's world: failures[${index}] fails session.open for "${failure.journey}", a Journey the world does not have`);
    }
  });
  for (const id of world.heldOpens ?? []) {
    if (!journeyOf(id)?.projectPath) {
      throw new Error(`The fake host's world: heldOpens holds "${id}", a Journey with no project path`);
    }
  }
  for (const id of Object.keys(world.sessionCwds ?? {})) {
    if (!journeyOf(id)) throw new Error(`The fake host's world: sessionCwds names "${id}", a Journey the world does not have`);
  }
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
  readonly #failures: { readonly failure: ScriptedFailure; answered: boolean; failing: boolean }[];
  /** Per Journey scripted to hold its open: "waiting" for it, the reply "held", or "released". */
  readonly #heldOpens = new Map<string, "waiting" | { readonly send: () => void } | "released">();
  #held: Held | null = null;
  #clock = CLOCK_START;

  constructor(world: World) {
    this.identity = checkWorld(world);
    this.#world = world;
    this.#turns = world.turns.map((turn) => ({ turn, played: false }));
    this.#failures = (world.failures ?? []).map((failure) => ({ failure, answered: false, failing: true }));
    for (const journey of world.heldOpens ?? []) this.#heldOpens.set(journey, "waiting");
  }

  requestsOf<T extends ClientRequestBody["type"]>(type: T): Extract<ClientRequestBody, { type: T }>[] {
    return this.requests.filter((request): request is Extract<ClientRequestBody, { type: T }> => request.type === type);
  }

  /** The turn the last prompt started, while it holds its events back. */
  heldTurn(): HeldTurn {
    if (!this.#held) throw new Error("No turn is held: script one with held: true and send its prompt first.");
    return this.#held;
  }

  /** The held session.open of `journey`, once the UI has sent it. */
  heldOpen(journey: string): HeldOpen {
    const held = this.#heldOpens.get(journey);
    if (held === undefined || typeof held === "string") {
      throw new Error(`No session.open for ${journey} is held: send in it first.`);
    }
    return {
      release: () => {
        this.#heldOpens.set(journey, "released");
        held.send();
      },
    };
  }

  /** The person fixed what made `request` fail (for `journey`, for a session.open): answer it normally from now on. */
  stopFailing(request: ScriptedFailure["request"], journey?: string): void {
    const matching = this.#failures.filter(
      ({ failure }) => failure.request === request && (failure.request !== "session.open" || failure.journey === journey),
    );
    if (matching.length === 0) throw new Error(`No failure is scripted for ${request}${journey ? ` in ${journey}` : ""}.`);
    for (const scripted of matching) scripted.failing = false;
  }

  /** Record what the world scripted and the test never exercised. */
  checkScriptUsed(): void {
    for (const { turn, played } of this.#turns) {
      if (!played) record("unscripted", `the turn scripted for "${turn.prompt}" was never played`);
    }
    for (const { failure, answered } of this.#failures) {
      if (!answered) record("unscripted", `the failure scripted for ${describeFailure(failure)} was never answered`);
    }
    for (const [journey, held] of this.#heldOpens) {
      if (held === "waiting") record("unscripted", `the session.open scripted to be held for ${journey} was never sent`);
      else if (held !== "released") record("unscripted", `the session.open held for ${journey} was never released`);
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
      const failure = this.#failing("hello");
      if (failure) {
        // As the real host closes after an unauthorized answer, and keeps the
        // connection after any other.
        if (failure.code === "unauthorized") this.#refuse(connection, id, failure.code, failure.message);
        else this.#error(connection, id, failure.code, failure.message);
        return;
      }
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
      case "journeys.list": {
        const failure = this.#failing("journeys.list");
        if (failure) this.#error(connection, id, failure.code, failure.message);
        else this.#reply(connection, { id, result: { type: "journeys.list", journeys: [...this.#world.journeys] } });
        return;
      }
      case "auth.providers":
        this.#reply(connection, { id, result: { type: "auth.providers", providers: [...(this.#world.providers ?? [])] } });
        return;
      case "session.abort":
        if (!this.#sessions.has(request.sessionId)) {
          this.#unscripted(connection, id, `session.abort for ${request.sessionId}, a session the fake host never opened`);
          return;
        }
        this.#reply(connection, { id, result: { type: "session.abort", sessionId: request.sessionId } });
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
    const failure = this.#failing("session.open", journey.id);
    if (failure) {
      this.#error(connection, id, failure.code, failure.message);
      return;
    }
    const number = this.#sessions.size + 1;
    const sessionId = `session-${number}`;
    this.#sessions.set(sessionId, journey.id);
    const model = this.#world.models[0];
    const cwd = request.cwd ?? this.#world.sessionCwds?.[journey.id] ?? journey.projectPath;
    const answer = () =>
      this.#reply(connection, {
        id,
        result: {
          type: "session.open",
          sessionId,
          sessionFile: `/Users/test/.pi/agent/sessions/${sessionId}.jsonl`,
          cwd,
          journey: journey.id,
          mirrorConversationId: `conversation-${number}`,
          ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
          thinkingLevel: "medium",
          diagnostics: [],
        },
      });
    if (this.#heldOpens.get(journey.id) === "waiting") {
      log(`#${connection.side.id} session.open for ${journey.id} held`);
      this.#heldOpens.set(journey.id, { send: answer });
      return;
    }
    answer();
  }

  /** The scripted failure `request` meets now, marked answered; null when it is not failing. */
  #failing(request: ScriptedFailure["request"], journey?: string): HostError | null {
    const scripted = this.#failures.find(
      ({ failure, failing }) =>
        failing && failure.request === request && (failure.request !== "session.open" || failure.journey === journey),
    );
    if (!scripted) return null;
    scripted.answered = true;
    return scripted.failure.error;
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
