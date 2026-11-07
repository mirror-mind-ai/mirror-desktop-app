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
// A turn can script the extension failures the real host reports for its
// session (`session.extension_error`, a host event a turn's fixture cannot
// carry): they are sent after the prompt's answer and before the turn's events.
//
// While a held turn answers, a prompt sent as a steer or a follow-up is
// queued as Pi queues it (CV1.DS2.US2): the queue is told with `queue_update`
// before the answer, a user message the turn scripts after its prompt is
// delivered from the queue (told again first), one never queued is recorded,
// and so is a turn that settles with a message still queued, which Pi would
// have delivered. A prompt with neither is refused as busy, as the real host
// refuses it. `session.abort` plays what Pi does to the turn: the queue
// withdrawn into the answer, a tool still running ended in error, the answer
// ended where it was (or an empty one where the loop would have asked again),
// and the run settled aborted. A turn can script `handled`, an extension
// command Pi runs without a run, which plays nothing.
//
// What the world does not script (an unknown Journey or session, a turn that is
// not next, a request type the fake host does not answer) is answered at once
// with a named error and recorded, so a test never waits on a reply that will
// not come.
//
// A test can make the host go away, as a host process that dies does from the
// UI's side: every connection is dropped uncleanly, the port is dead to the
// next socket, and a held open that can no longer be answered is settled so
// teardown does not name it. A test that then reconnects serves a fresh host.
//
// A world can script a Journey's sessions on disk, the files the real host
// lists, reads and resumes (CV1.DS2.US1); the disk keeps them as Pi does
// (fakeDisk.ts). The fake host keeps the real host's rules for opening them:
// a Journey has one open session, and opening another closes it
// (`closedSessions` says which), or is refused while it answers; and a file is
// open once.
//
// A session runs on a model and a thinking level (CV1.DS2.US3), which the
// fake host keeps by the real host's rules (packages/host/src/modelChoice.ts):
// the world's models are the ones Pi can use; a new session starts on the
// Journey's `defaults` (the world's, else its first model at medium), a file
// resumes on its own model and level, else on the defaults, and on the
// default model with Pi's line when the world does not list its own; a choice
// comes with the open or with `session.configure`, a model the world does
// not list is refused, and the disk records each. The UI offers only a
// model's own levels and sends a model and its level together, so a request
// that does otherwise is recorded. A `session.configure` can be held, as an
// open can.

import {
  AuthProvider,
  AvailableModel,
  clampLevel,
  ClientRequest,
  type ClientRequestBody,
  HostError,
  HostEvent,
  HostIdentity,
  HostMessage,
  Journey,
  ModelAndLevel,
  type ModelRef,
  PROTOCOL_VERSION,
  type SessionEvent,
} from "@mirror-desktop/protocol";

import { listen, type ServerSide, type SocketPeer, type SocketServer, stopListening } from "./fakeSocket.ts";
import { scriptIpc } from "./ipcDoor.ts";
import { log } from "./traffic.ts";
import { checkSessions, FakeDisk, type ReadSession, type ScriptedSession } from "./fakeDisk.ts";
import { contentProblem, parseTurn } from "./turns.ts";
import { record } from "./violations.ts";

export interface ScriptedTurn {
  /** The prompt this turn answers. A prompt with any other text is a violation. */
  readonly prompt: string;
  /** What the host plays after answering the prompt: a fixture from loadTurn(), or events written inline. */
  readonly events: readonly SessionEvent[];
  /** Hold the events until the test releases them, to watch the stream and the running state. */
  readonly held?: boolean;
  /** Extensions that fail inside Pi on this turn, reported after the prompt's answer and before the events. */
  readonly extensionErrors?: readonly ExtensionFailure[];
  /** Pi handles the prompt without a run, as an extension command: answered `handled`, nothing played. Its events are empty. */
  readonly handled?: boolean;
}

/** An extension failing inside Pi, as the real host reports it for a session. */
export interface ExtensionFailure {
  readonly extension: string;
  readonly event: string;
  readonly message: string;
}

/** A request the host fails with `error`, as the real host would, until the test calls stopFailing(). */
export type ScriptedFailure =
  | { readonly request: "hello" | "journeys.list"; readonly error: HostError }
  | { readonly request: JourneyRequest; readonly journey: string; readonly error: HostError };

/** The requests made for one Journey, whose failures are scripted per Journey. */
type JourneyRequest = "session.open" | "sessions.list" | "session.transcript" | "session.prompt" | "session.configure";

export type { ScriptedSession };

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
  /** Each Journey's sessions on disk, in any order; a Journey with none lists none. */
  readonly sessions?: Readonly<Record<string, readonly ScriptedSession[]>>;
  /** What a new session in a Journey starts with, from Pi's settings; else the world's first model at medium. */
  readonly defaults?: Readonly<Record<string, ModelAndLevel>>;
  /** Journeys whose first session.configure is answered only when the test releases it. */
  readonly heldConfigures?: readonly string[];
}

/** A turn whose events wait for the test. */
export interface HeldTurn {
  readonly remaining: number;
  /** Send every event left. */
  release(): void;
  /** Send the events up to and including the first that matches. */
  releaseThrough(match: (event: SessionEvent) => boolean): void;
}

/** A session.open or a session.configure whose answer waits for the test. */
export interface HeldOpen {
  release(): void;
}

/** The first answer of one request per Journey, scripted to wait for the test. */
class HeldAnswers {
  readonly #request: string;
  /** Per Journey: "waiting" for the request, the answer "held", or "released". */
  readonly #state = new Map<string, "waiting" | { readonly send: () => void } | "released">();

  constructor(request: string, journeys: readonly string[] = []) {
    this.#request = request;
    for (const journey of journeys) this.#state.set(journey, "waiting");
  }

  /** Hold `send` when the Journey's answer is scripted to wait; false when it is not. */
  held(journey: string, send: () => void): boolean {
    if (this.#state.get(journey) !== "waiting") return false;
    this.#state.set(journey, { send });
    return true;
  }

  /** The held answer of `journey`, once the UI has asked. */
  of(journey: string): HeldOpen {
    const held = this.#state.get(journey);
    if (held === undefined || typeof held === "string") throw new Error(`No ${this.#request} for ${journey} is held: send in it first.`);
    return {
      release: () => {
        this.#state.set(journey, "released");
        held.send();
      },
    };
  }

  /** The host went away: an answer it held can no longer be sent, and is not reported. */
  settle(): void {
    for (const [journey, held] of this.#state) {
      if (held !== "waiting" && held !== "released") this.#state.set(journey, "released");
    }
  }

  /** What was scripted to wait and never asked for, or held and never released. */
  unused(): string[] {
    return [...this.#state].flatMap(([journey, held]) =>
      held === "waiting"
        ? [`the ${this.#request} scripted to be held for ${journey} was never sent`]
        : held === "released"
          ? []
          : [`the ${this.#request} held for ${journey} was never released`],
    );
  }
}

type SessionOpen = Extract<ClientRequestBody, { type: "session.open" }>;
type SessionConfigure = Extract<ClientRequestBody, { type: "session.configure" }>;
type SessionPrompt = Extract<ClientRequestBody, { type: "session.prompt" }>;
type SessionsList = Extract<ClientRequestBody, { type: "sessions.list" }>;
type SessionTranscript = Extract<ClientRequestBody, { type: "session.transcript" }>;

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
  return "journey" in failure ? `${failure.request} in ${failure.journey}` : failure.request;
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
    if ("journey" in failure && !journeyOf(failure.journey)) {
      throw new Error(`The fake host's world: failures[${index}] fails ${failure.request} for "${failure.journey}", a Journey the world does not have`);
    }
  });
  for (const [field, ids] of [["heldOpens", world.heldOpens], ["heldConfigures", world.heldConfigures]] as const) {
    for (const id of ids ?? []) {
      if (!journeyOf(id)?.projectPath) throw new Error(`The fake host's world: ${field} holds "${id}", a Journey with no project path`);
    }
  }
  for (const [id, defaults] of Object.entries(world.defaults ?? {})) {
    if (!journeyOf(id)) throw new Error(`The fake host's world: defaults names "${id}", a Journey the world does not have`);
    const parsed = ModelAndLevel.safeParse(defaults);
    if (!parsed.success) throw fail(`defaults.${id}`, parsed.error.issues[0]);
  }
  for (const id of Object.keys(world.sessionCwds ?? {})) {
    if (!journeyOf(id)) throw new Error(`The fake host's world: sessionCwds names "${id}", a Journey the world does not have`);
  }
  checkSessions(world.sessions ?? {}, (id) => journeyOf(id)?.projectPath !== undefined, fail);
  world.turns.forEach((turn, index) => {
    if (turn.handled) {
      if (turn.events.length > 0) throw new Error(`The fake host's world: turns[${index}] is handled without a run, so it plays no events`);
    } else {
      parseTurn(`turns[${index}] ("${turn.prompt}")`, turn.events);
    }
    turn.extensionErrors?.forEach((failure, at) => {
      const parsed = HostEvent.safeParse({ type: "session.extension_error", sessionId: "session-1", ...failure });
      if (!parsed.success) throw fail(`turns[${index}].extensionErrors[${at}]`, parsed.error.issues[0]);
    });
    // The first user message is the prompt's echo; a later one is a queued message Pi delivers.
    const echo = turn.events.find((event) => event.type === "message_end" && event.role === "user");
    if (echo?.type === "message_end" && echo.text !== turn.prompt) {
      throw new Error(`The fake host's world: turns[${index}] is scripted for "${turn.prompt}" but its user message says "${echo.text}"`);
    }
  });
  return identity.data;
}

/** A turn being played in a session: what it has sent so far, and whether its prompt's echo is among it. */
interface Playing {
  readonly sessionId: string;
  readonly journey: string;
  readonly file: string;
  readonly sent: SessionEvent[];
  echoed: boolean;
}

class Held implements HeldTurn {
  readonly #events: SessionEvent[];
  /** Sends one event, knowing the one after it: a delivery is told before its message starts. */
  readonly #play: (event: SessionEvent, next: SessionEvent | undefined) => void;
  readonly #done: () => void;

  constructor(events: SessionEvent[], play: (event: SessionEvent, next: SessionEvent | undefined) => void, done: () => void) {
    this.#events = events;
    this.#play = play;
    this.#done = done;
  }

  get remaining(): number {
    return this.#events.length;
  }

  release(): void {
    this.#sendFirst(this.#events.length);
  }

  releaseThrough(match: (event: SessionEvent) => boolean): void {
    const index = this.#events.findIndex(match);
    if (index === -1) {
      throw new Error(`The held turn has no event left that matches; ${this.#events.length} event(s) remain.`);
    }
    this.#sendFirst(index + 1);
  }

  /** A stop: what is left is never sent. */
  drop(): void {
    this.#events.splice(0);
  }

  #sendFirst(count: number): void {
    for (let sent = 0; sent < count; sent += 1) {
      const event = this.#events.shift();
      if (event === undefined) break;
      this.#play(event, this.#events[0]);
    }
    if (count > 0 && this.#events.length === 0) this.#done();
  }
}

/**
 * What Pi emits when a run is stopped after `sent`: a tool still running ends
 * in error, with its result message; the answer streaming ends where it was;
 * when no answer is streaming and the loop would ask the model again (the
 * answer had not begun, or the last one called tools), an empty answer is
 * started and ended, stopped; then the run ends, if it had not, and settles
 * aborted.
 */
function stoppedRun(sent: readonly SessionEvent[]): SessionEvent[] {
  const stopped: SessionEvent[] = [];
  const aborted = { stopReason: "aborted", errorMessage: "Request was aborted" } as const;
  const ended = new Set(sent.flatMap((event) => (event.type === "tool_end" ? [event.toolCallId] : [])));
  for (const event of sent) {
    if (event.type !== "tool_start" || ended.has(event.toolCallId)) continue;
    stopped.push(
      { type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, isError: true, resultText: "Operation aborted" },
      { type: "message_start", role: "toolResult" },
      { type: "message_end", role: "toolResult", text: "Operation aborted" },
    );
  }
  const lastStart = sent.findLastIndex((event) => event.type === "message_start");
  const opened = sent[lastStart];
  const streaming = opened?.type === "message_start" && opened.role === "assistant" && !sent.slice(lastStart + 1).some((event) => event.type === "message_end");
  if (streaming) {
    const text = sent
      .slice(lastStart + 1)
      .map((event) => (event.type === "text_delta" ? event.delta : ""))
      .join("");
    stopped.push({ type: "message_end", role: "assistant", text, ...aborted });
  } else {
    const lastPrompt = sent.findLastIndex((event) => event.type === "message_end" && event.role === "user");
    const answer = sent.slice(lastPrompt + 1).findLast((event) => event.type === "message_end" && event.role === "assistant");
    const asksAgain = answer === undefined || (answer.type === "message_end" && answer.stopReason === "toolUse");
    if (asksAgain && !sent.some((event) => event.type === "agent_end")) {
      stopped.push({ type: "message_start", role: "assistant" }, { type: "message_end", role: "assistant", text: "", ...aborted });
    }
  }
  if (!sent.some((event) => event.type === "agent_end")) stopped.push({ type: "agent_end" });
  stopped.push({ type: "agent_settled", aborted: true });
  return stopped;
}

export class FakeHost implements SocketServer {
  readonly endpoint = { port: 0, token: "fake-host-token" } as const;
  readonly identity: HostIdentity;
  /** Every request received that the protocol accepts, in order. */
  readonly requests: ClientRequestBody[] = [];
  readonly #world: World;
  readonly #turns: { readonly turn: ScriptedTurn; played: boolean }[];
  /** The sessions a later session.open for their Journey closed, in order. */
  readonly closedSessions: string[] = [];
  readonly #connections = new Set<Connection>();
  /** The open sessions, by id: their Journey, their file, and what they run on. */
  readonly #sessions = new Map<string, { readonly journey: string; readonly file: string; runsOn: ModelAndLevel }>();
  readonly #disk: FakeDisk;
  #newSessions = 0;
  #opens = 0;
  readonly #failures: { readonly failure: ScriptedFailure; answered: boolean; failing: boolean }[];
  readonly #heldOpens: HeldAnswers;
  readonly #heldConfigures: HeldAnswers;
  #held: { readonly turn: Held; readonly playing: Playing } | null = null;
  /** Each open session's queue, as Pi keeps it: steering first. */
  readonly #queues = new Map<string, { steering: string[]; followUp: string[] }>();
  #clock = CLOCK_START;

  constructor(world: World) {
    this.identity = checkWorld(world);
    this.#world = world;
    this.#turns = world.turns.map((turn) => ({ turn, played: false }));
    this.#failures = (world.failures ?? []).map((failure) => ({ failure, answered: false, failing: true }));
    this.#heldOpens = new HeldAnswers("session.open", world.heldOpens);
    this.#heldConfigures = new HeldAnswers("session.configure", world.heldConfigures);
    this.#disk = new FakeDisk(world.sessions);
  }

  requestsOf<T extends ClientRequestBody["type"]>(type: T): Extract<ClientRequestBody, { type: T }>[] {
    return this.requests.filter((request): request is Extract<ClientRequestBody, { type: T }> => request.type === type);
  }

  /** The turn the last prompt started, while it holds its events back. */
  heldTurn(): HeldTurn {
    if (!this.#held) throw new Error("No turn is held: script one with held: true and send its prompt first.");
    return this.#held.turn;
  }

  /** The held session.open of `journey`, once the UI has sent it. */
  heldOpen(journey: string): HeldOpen {
    return this.#heldOpens.of(journey);
  }

  /** The held session.configure of `journey`, once the UI has sent it. */
  heldConfigure(journey: string): HeldOpen {
    return this.#heldConfigures.of(journey);
  }

  /** The host process died: every connection dropped as a killed process drops it, and the port dead from now on. */
  goAway(): void {
    log("the fake host goes away");
    stopListening(`ws://127.0.0.1:${this.endpoint.port}`);
    for (const connection of this.#connections) connection.side.drop();
    this.#connections.clear();
    this.#heldOpens.settle();
    this.#heldConfigures.settle();
  }

  /** The person fixed what made `request` fail (for `journey`, for a session.open): answer it normally from now on. */
  stopFailing(request: ScriptedFailure["request"], journey?: string): void {
    const matching = this.#failures.filter(
      ({ failure }) => failure.request === request && (!("journey" in failure) || failure.journey === journey),
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
    for (const detail of [...this.#heldOpens.unused(), ...this.#heldConfigures.unused()]) record("unscripted", detail);
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
      case "sessions.list":
        this.#list(connection, id, request);
        return;
      case "session.transcript":
        this.#transcript(connection, id, request);
        return;
      case "session.abort":
        this.#abort(connection, id, request.sessionId);
        return;
      case "session.open":
        this.#open(connection, id, request);
        return;
      case "session.prompt":
        this.#prompt(connection, id, request);
        return;
      case "session.configure":
        this.#configure(connection, id, request);
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
    const resumed = request.sessionFile === undefined ? undefined : this.#disk.listed(journey.id, request.sessionFile);
    if (request.sessionFile !== undefined && !resumed) {
      this.#notTheJourneys(connection, id, `session.open of ${request.sessionFile}`, journey.id);
      return;
    }
    // The person's choice, refused as the real host refuses it, before anything closes.
    let chosen: ModelAndLevel | undefined;
    if (request.model !== undefined && request.thinkingLevel !== undefined) {
      const listed = this.#listedModel(request.model);
      if (!listed) {
        this.#error(connection, id, "model_not_available", `Pi knows no model ${request.model.provider}/${request.model.id}.`);
        return;
      }
      chosen = { model: request.model, thinkingLevel: this.#levelOf("session.open", listed, request.thinkingLevel) };
    }
    // As the real host keeps one open session per Journey (sessionPolicy.ts).
    const previous = [...this.#sessions].filter(([, open]) => open.journey === journey.id).map(([sessionId]) => sessionId);
    if (previous.some((sessionId) => this.#answering(sessionId))) {
      this.#error(connection, id, "session_busy", "The Journey's session is still answering: stop it or let it finish first.");
      return;
    }
    if (resumed && [...this.#sessions].some(([sessionId, open]) => open.file === resumed.file && !previous.includes(sessionId))) {
      this.#error(connection, id, "session_open_failed", "That session is already open in this app.");
      return;
    }
    for (const sessionId of previous) {
      this.#sessions.delete(sessionId);
      this.#queues.delete(sessionId);
      this.closedSessions.push(sessionId);
      log(`#${connection.side.id} session ${sessionId} closed by the next open for ${journey.id}`);
    }
    const sessionId = resumed ? resumed.id : `session-${++this.#newSessions}`;
    const sessionFile = resumed ? resumed.file : `/Users/test/.pi/agent/sessions/${sessionId}.jsonl`;
    // A new session starts on the choice or the defaults; a resumed one on its
    // own, then on the choice, which its file records; Pi says where it fell back.
    const resumes = resumed ? this.#resumeOf(journey.id, resumed) : undefined;
    const runsOn = chosen ?? resumes?.runsOn ?? this.#defaultsOf(journey.id);
    const diagnostics = !chosen && resumes?.fallback ? [resumes.fallback] : [];
    if (!resumed) this.#disk.create(journey.id, sessionId, sessionFile, runsOn);
    else if (chosen) this.#disk.configured(journey.id, sessionFile, chosen);
    this.#sessions.set(sessionId, { journey: journey.id, file: sessionFile, runsOn });
    const number = ++this.#opens;
    const cwd = request.cwd ?? this.#world.sessionCwds?.[journey.id] ?? journey.projectPath;
    const answer = () =>
      this.#reply(connection, {
        id,
        result: {
          type: "session.open",
          sessionId,
          sessionFile,
          cwd,
          journey: journey.id,
          mirrorConversationId: `conversation-${number}`,
          ...runsOn,
          diagnostics,
        },
      });
    if (this.#heldOpens.held(journey.id, answer)) {
      log(`#${connection.side.id} session.open for ${journey.id} held`);
      return;
    }
    answer();
  }

  /** Change an open session's model and level as the real host does, answering what it runs on after. */
  #configure(connection: Connection, id: string, request: SessionConfigure): void {
    const open = this.#sessions.get(request.sessionId);
    if (!open) {
      this.#unscripted(connection, id, `session.configure for ${request.sessionId}, a session the fake host never opened`);
      return;
    }
    const failure = this.#failing("session.configure", open.journey);
    if (failure) {
      this.#error(connection, id, failure.code, failure.message);
      return;
    }
    if (request.model === undefined) record("unscripted", "session.configure without a model: the UI sends the model and its level together");
    if (request.thinkingLevel === undefined) record("unscripted", "session.configure without a level: the UI sends the model and its level together");
    const model = request.model ?? open.runsOn.model;
    const listed = model ? this.#listedModel(model) : undefined;
    if (request.model !== undefined && !listed) {
      this.#error(connection, id, "model_not_available", `Pi knows no model ${request.model.provider}/${request.model.id}.`);
      return;
    }
    const level = request.thinkingLevel ?? open.runsOn.thinkingLevel;
    open.runsOn = { ...(model ? { model } : {}), thinkingLevel: listed ? this.#levelOf("session.configure", listed, level) : level };
    this.#disk.configured(open.journey, open.file, open.runsOn);
    const runsOn = open.runsOn;
    const answer = () => this.#reply(connection, { id, result: { type: "session.configure", sessionId: request.sessionId, ...runsOn } });
    if (this.#heldConfigures.held(open.journey, answer)) {
      log(`#${connection.side.id} session.configure for ${open.journey} held`);
      return;
    }
    answer();
  }

  /** What a new session in `journey` starts with: the world's defaults, else its first model at medium. */
  #defaultsOf(journey: string): ModelAndLevel {
    const scripted = this.#world.defaults?.[journey];
    if (scripted) return scripted;
    const first = this.#world.models[0];
    return first ? { model: { provider: first.provider, id: first.id }, thinkingLevel: clampLevel("medium", first.thinkingLevels) } : { thinkingLevel: "medium" };
  }

  /** The world's model for `ref`: one Pi can use. */
  #listedModel(ref: ModelRef): AvailableModel | undefined {
    return this.#world.models.find((model) => model.provider === ref.provider && model.id === ref.id);
  }

  /**
   * What resuming `session` starts with, by the real host's rule: its own
   * model when Pi can use it, else the default one, with Pi's line saying
   * so; its own level, else the default level; clamped to the model.
   */
  #resumeOf(journey: string, session: ReadSession): { runsOn: ModelAndLevel; fallback?: string } {
    const defaults = this.#defaultsOf(journey);
    const own = session.model ? this.#listedModel(session.model) : undefined;
    const model = own ? session.model : defaults.model;
    const listed = model ? this.#listedModel(model) : undefined;
    const level = session.thinkingLevel ?? defaults.thinkingLevel;
    const runsOn = { ...(model ? { model } : {}), thinkingLevel: listed ? clampLevel(level, listed.thinkingLevels) : level };
    const fallback =
      session.model && !own && defaults.model
        ? `Could not restore model ${session.model.provider}/${session.model.id}. Using ${defaults.model.provider}/${defaults.model.id}`
        : undefined;
    return { runsOn, ...(fallback ? { fallback } : {}) };
  }

  /** The level `request` asked of `model`, clamped as Pi clamps it; one the model does not list is the UI's mistake, recorded. */
  #levelOf(request: string, model: AvailableModel, level: string): string {
    if (!model.thinkingLevels.includes(level)) {
      record(
        "unscripted",
        `${request} asked ${level} of ${model.provider}/${model.id}, which lists ${model.thinkingLevels.join(", ")}: the UI offers only a model's own levels`,
      );
    }
    return clampLevel(level, model.thinkingLevels);
  }

  #list(connection: Connection, id: string, request: SessionsList): void {
    const journey = this.#listable(connection, id, request);
    if (!journey) return;
    const failure = this.#failing("sessions.list", journey);
    if (failure) {
      this.#error(connection, id, failure.code, failure.message);
      return;
    }
    this.#reply(connection, { id, result: { type: "sessions.list", journey, sessions: this.#disk.list(journey), defaults: this.#defaultsOf(journey) } });
  }

  #transcript(connection: Connection, id: string, request: SessionTranscript): void {
    const journey = this.#listable(connection, id, request);
    if (!journey) return;
    const failure = this.#failing("session.transcript", journey);
    if (failure) {
      this.#error(connection, id, failure.code, failure.message);
      return;
    }
    const session = this.#disk.listed(journey, request.sessionFile);
    if (!session) {
      this.#notTheJourneys(connection, id, `session.transcript of ${request.sessionFile}`, journey);
      return;
    }
    this.#reply(connection, {
      id,
      result: {
        type: "session.transcript",
        sessionFile: session.file,
        entries: [...session.entries],
        earlier: session.earlier,
        resumes: this.#resumeOf(journey, session).runsOn,
      },
    });
  }

  /** The Journey a read names, when the real host could list it; otherwise answered as unscripted. */
  #listable(connection: Connection, id: string, request: SessionsList | SessionTranscript): string | undefined {
    const journey = this.#world.journeys.find((candidate) => candidate.id === request.journey);
    if (!journey?.projectPath) {
      const why = journey ? "which has no project path" : "a Journey the world does not have";
      this.#unscripted(connection, id, `${request.type} for "${request.journey}", ${why}`);
      return undefined;
    }
    return journey.id;
  }

  /** A file the UI should only know from the list: refused as the real host refuses it, and recorded. */
  #notTheJourneys(connection: Connection, id: string, what: string, journey: string): void {
    record("unscripted", `${what}, which is not one of ${journey}'s sessions`);
    log(`#${connection.side.id} refuses ${what}`);
    this.#error(connection, id, "session_open_failed", "That file is not one of the Journey's sessions.");
  }

  /** Whether the session's turn is still playing: held, with events left. */
  #answering(sessionId: string): boolean {
    return this.#held !== null && this.#held.playing.sessionId === sessionId && this.#held.turn.remaining > 0;
  }

  /** The scripted failure `request` meets now, marked answered; null when it is not failing. */
  #failing(request: ScriptedFailure["request"], journey?: string): HostError | null {
    const scripted = this.#failures.find(
      ({ failure, failing }) => failing && failure.request === request && (!("journey" in failure) || failure.journey === journey),
    );
    if (!scripted) return null;
    scripted.answered = true;
    return scripted.failure.error;
  }

  #prompt(connection: Connection, id: string, request: SessionPrompt): void {
    const open = this.#sessions.get(request.sessionId);
    if (!open) {
      this.#unscripted(connection, id, `session.prompt for ${request.sessionId}, a session the fake host never opened`);
      return;
    }
    const failure = this.#failing("session.prompt", open.journey);
    if (failure) {
      this.#error(connection, id, failure.code, failure.message);
      return;
    }
    if (this.#answering(request.sessionId)) {
      if (request.streamingBehavior) this.#queue(connection, id, request.sessionId, request.text, request.streamingBehavior);
      // As the real host refuses it (turnControl.ts).
      else this.#error(connection, id, "session_busy", "The session is still answering.");
      return;
    }
    // Nothing answers: a steer or a follow-up starts a run, as Pi starts one.
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
    if (next.turn.handled) {
      this.#reply(connection, { id, result: { type: "session.prompt", sessionId: request.sessionId, disposition: "handled" } });
      return;
    }
    this.#disk.prompted(open.journey, open.file, request.text, this.#clock++);
    this.#reply(connection, { id, result: { type: "session.prompt", sessionId: request.sessionId, disposition: "started" } });
    for (const extensionFailure of next.turn.extensionErrors ?? []) {
      this.#broadcastHostEvent({ type: "session.extension_error", sessionId: request.sessionId, ...extensionFailure });
    }
    const playing: Playing = { sessionId: request.sessionId, journey: open.journey, file: open.file, sent: [], echoed: false };
    const events = [...next.turn.events];
    if (next.turn.held) {
      const turn = new Held(events, (event, following) => this.#play(playing, event, following), () => this.#written(playing));
      this.#held = { turn, playing };
      return;
    }
    events.forEach((event, index) => this.#play(playing, event, events[index + 1]));
    this.#written(playing);
  }

  /** A steer or a follow-up while the session answers: queued as Pi queues it, the queue told before the answer. */
  #queue(connection: Connection, id: string, sessionId: string, text: string, behavior: "steer" | "followUp"): void {
    // A queued message reaches the traffic log, and maybe the draft, without passing a turn's net.
    const problem = contentProblem(text);
    if (problem) record("unscripted", `session.prompt queued text the fixture net refuses: ${problem}`);
    const queue = this.#queueOf(sessionId);
    (behavior === "steer" ? queue.steering : queue.followUp).push(text);
    this.#tellQueue(sessionId);
    this.#reply(connection, { id, result: { type: "session.prompt", sessionId, disposition: "queued" } });
  }

  /**
   * Send one event of the turn being played, doing first what Pi does around
   * it: a queued message leaves the queue, told, before its echo starts; and
   * a run that settles has delivered everything it held.
   */
  #play(playing: Playing, event: SessionEvent, next: SessionEvent | undefined): void {
    if (event.type === "message_start" && event.role === "user" && playing.echoed && next?.type === "message_end" && next.role === "user") {
      this.#deliver(playing.sessionId, next.text);
    }
    if (event.type === "message_end" && event.role === "user") playing.echoed = true;
    if (event.type === "agent_settled" && !event.aborted) {
      const queue = this.#queueOf(playing.sessionId);
      const left = [...queue.steering, ...queue.followUp];
      if (left.length > 0) {
        record("unscripted", `the turn settled with ${left.map((text) => `"${text}"`).join(", ")} still queued, which Pi delivers before it settles`);
      }
    }
    playing.sent.push(event);
    this.#broadcast(playing.sessionId, event);
  }

  /** Take `text` from the session's queue, steering first and the first of equal texts, and tell the queue. */
  #deliver(sessionId: string, text: string): void {
    const queue = this.#queueOf(sessionId);
    const list = queue.steering.includes(text) ? queue.steering : queue.followUp.includes(text) ? queue.followUp : undefined;
    if (!list) {
      record("unscripted", `the turn delivers "${text}", which was never queued`);
      return;
    }
    list.splice(list.indexOf(text), 1);
    this.#tellQueue(sessionId);
  }

  /** Stop the session's turn as Pi does, and answer with the queue it withdrew. */
  #abort(connection: Connection, id: string, sessionId: string): void {
    if (!this.#sessions.has(sessionId)) {
      this.#unscripted(connection, id, `session.abort for ${sessionId}, a session the fake host never opened`);
      return;
    }
    const queue = this.#queueOf(sessionId);
    const withdrawn = { steering: queue.steering.splice(0), followUp: queue.followUp.splice(0) };
    this.#tellQueue(sessionId);
    const held = this.#held;
    if (held && this.#answering(sessionId)) {
      held.turn.drop();
      for (const event of stoppedRun(held.playing.sent)) this.#play(held.playing, event, undefined);
      this.#written(held.playing);
    }
    this.#reply(connection, { id, result: { type: "session.abort", sessionId, withdrawn } });
  }

  /** What a turn played, written to the session's file once it is over. */
  #written(playing: Playing): void {
    this.#disk.played(playing.journey, playing.file, playing.sent);
  }

  #queueOf(sessionId: string): { steering: string[]; followUp: string[] } {
    let queue = this.#queues.get(sessionId);
    if (!queue) {
      queue = { steering: [], followUp: [] };
      this.#queues.set(sessionId, queue);
    }
    return queue;
  }

  #tellQueue(sessionId: string): void {
    const queue = this.#queueOf(sessionId);
    this.#broadcast(sessionId, { type: "queue_update", steering: [...queue.steering], followUp: [...queue.followUp] });
  }

  /** A session event, stamped, to every open, authenticated connection, as the real host broadcasts. */
  #broadcast(sessionId: string, event: SessionEvent): void {
    this.#broadcastHostEvent({ type: "session.event", sessionId, at: this.#clock++, event });
  }

  #broadcastHostEvent(message: HostEvent): void {
    const problem = outboundProblem(message);
    if (problem) {
      record("protocol", problem);
      return;
    }
    const targets = [...this.#connections].filter((connection) => connection.authenticated && connection.side.isOpen);
    const what = message.type === "session.event" ? message.event.type : message.type;
    log(`event ${what} → ${targets.map((target) => `#${target.side.id}`).join(", ") || "nobody"}`);
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
