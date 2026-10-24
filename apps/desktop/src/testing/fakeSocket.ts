// A WebSocket double, faithful where HostClient depends on a real one.
//
// The UI setup installs FakeSocket as the global WebSocket, so the real
// HostClient constructs it unchanged. It is a test double only if it behaves
// like the boundary it replaces, so it keeps the rules a real socket keeps:
//
// - it opens in a later task, so a listener added after construction hears it;
// - it refuses to send while connecting (InvalidStateError);
// - it carries text frames only, and delivers the host's frames as
//   MessageEvents, one per task, so React sees a stream rather than one batch;
// - close() is CLOSING at once and CLOSED later, and nothing is delivered after it.
//
// It connects only to an address a fake host is listening on, which is exactly
// `ws://127.0.0.1:<port>` for the port the fake endpoint handed out. A socket to
// any other address is refused, as a real refused connection is, and recorded:
// the host token must never be sent anywhere else. An address a host stopped
// listening on is refused the same way and recorded as nothing: that is a dead
// port, which is what a host process that died leaves behind.
//
// A host can close a socket cleanly, with a code and a reason, as the real host
// does after an unauthorized hello; or drop it, as a dying process does: the
// frames it already sent arrive, then an error, then an unclean close with
// 1006 and no reason.

import { log } from "./traffic.ts";
import { record } from "./violations.ts";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** What a fake host sees of one socket. */
export interface ServerSide {
  readonly id: number;
  readonly isOpen: boolean;
  send(frame: string): void;
  /** Close cleanly, with a close frame the UI hears by code and reason. */
  close(code: number, reason: string): void;
  /** Vanish, as a killed process does: no close frame; the UI hears an error, then an unclean 1006. */
  drop(): void;
}

/** What a fake host gives a socket that connects to it. */
export interface SocketPeer {
  receive(frame: string): void;
  closed(): void;
}

export interface SocketServer {
  accept(side: ServerSide): SocketPeer;
}

const servers = new Map<string, SocketServer>();
/** Addresses a host once listened on: a socket to one is a dead port, not a violation. */
const stopped = new Set<string>();
const sockets = new Set<FakeSocket>();
const timers = new Set<ReturnType<typeof setTimeout>>();
let nextId = 1;

/** Run `task` in a later task, as a real socket's events are; cancelled by resetSockets(). */
function later(task: () => void): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    task();
  }, 0);
  timers.add(timer);
}

/** Accept sockets to `url` on behalf of `server`. */
export function listen(url: string, server: SocketServer): void {
  servers.set(url, server);
  stopped.delete(url);
}

/** The host at `url` is gone: a socket to it from now on errors and closes, as one to a dead port does. */
export function stopListening(url: string): void {
  if (servers.delete(url)) stopped.add(url);
}

/**
 * Forget every server and drop every frame still queued: the harness resets
 * between tests so a turn still playing when one test ends delivers nothing to
 * the next.
 */
export function resetSockets(): void {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const socket of sockets) socket.discard();
  sockets.clear();
  servers.clear();
  stopped.clear();
  nextId = 1;
}

function closeEvent(code: number, reason: string, wasClean: boolean): Event {
  if (typeof CloseEvent === "function") return new CloseEvent("close", { code, reason, wasClean });
  return Object.assign(new Event("close"), { code, reason, wasClean });
}

export class FakeSocket extends EventTarget implements WebSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  binaryType: BinaryType = "blob";
  readonly bufferedAmount = 0;
  readonly extensions = "";
  readonly protocol = "";
  readonly url: string;
  onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, event: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null;
  onopen: ((this: WebSocket, event: Event) => unknown) | null = null;

  readonly #id: number;
  #readyState = CONNECTING;
  #peer: SocketPeer | null = null;
  #inbox: string[] = [];
  #pumping = false;
  /** The host asked to close, or dropped: delivered after the frames it sent before, as a real close is. */
  #hostClose: { code: number; reason: string; clean: boolean } | null = null;

  constructor(url: string | URL, _protocols?: string | string[]) {
    super();
    this.url = String(url);
    this.#id = nextId++;
    sockets.add(this);
    const server = servers.get(this.url);
    if (!server) {
      if (stopped.has(this.url)) {
        log(`socket #${this.#id} to ${this.url} refused: the host is gone`);
      } else {
        record("socket", `a socket to ${this.url}, which is not the fake host's endpoint`);
        log(`socket #${this.#id} to ${this.url} refused: not the fake host`);
      }
      later(() => {
        this.#readyState = CLOSED;
        sockets.delete(this);
        this.#fire(new Event("error"));
        this.#fire(closeEvent(1006, "", false));
      });
      return;
    }
    later(() => {
      if (this.#readyState !== CONNECTING) return;
      this.#readyState = OPEN;
      this.#peer = server.accept(this.#serverSide());
      log(`socket #${this.#id} open`);
      this.#fire(new Event("open"));
    });
  }

  get readyState(): number {
    return this.#readyState;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.#readyState === CONNECTING) {
      throw new DOMException("The socket is still connecting.", "InvalidStateError");
    }
    if (this.#readyState !== OPEN) {
      log(`socket #${this.#id} sent after closing; discarded`);
      return;
    }
    if (typeof data !== "string") {
      record("protocol", `socket #${this.#id} sent a frame that is not text`);
      return;
    }
    const peer = this.#peer;
    later(() => peer?.receive(data));
  }

  close(code = 1000, reason = ""): void {
    if (this.#readyState === CLOSING || this.#readyState === CLOSED) return;
    this.#readyState = CLOSING;
    this.#inbox = [];
    later(() => {
      this.#readyState = CLOSED;
      sockets.delete(this);
      log(`socket #${this.#id} closed by the UI (${code})`);
      this.#peer?.closed();
      this.#fire(closeEvent(code, reason, true));
    });
  }

  /** Drop silently: the harness is resetting, and nothing may reach the next test. */
  discard(): void {
    this.#readyState = CLOSED;
    this.#inbox = [];
  }

  #serverSide(): ServerSide {
    const socket = this;
    return {
      id: this.#id,
      get isOpen() {
        return socket.#readyState === OPEN && socket.#hostClose === null;
      },
      send: (frame) => this.#receiveFromHost(frame),
      close: (code, reason) => this.#closeByHost(code, reason, true),
      drop: () => this.#closeByHost(1006, "", false),
    };
  }

  #receiveFromHost(frame: string): void {
    if (this.#readyState !== OPEN || this.#hostClose) return;
    this.#inbox.push(frame);
    this.#schedulePump();
  }

  #closeByHost(code: number, reason: string, clean: boolean): void {
    if (this.#readyState !== OPEN || this.#hostClose) return;
    this.#hostClose = { code, reason, clean };
    this.#schedulePump();
  }

  #schedulePump(): void {
    if (this.#pumping) return;
    this.#pumping = true;
    later(() => this.#pump());
  }

  /** One frame per task, so React can render between two of them; then the host's close, if it asked. */
  #pump(): void {
    if (this.#readyState !== OPEN) {
      this.#pumping = false;
      return;
    }
    const frame = this.#inbox.shift();
    if (frame !== undefined) {
      this.#fire(new MessageEvent("message", { data: frame }));
      later(() => this.#pump());
      return;
    }
    this.#pumping = false;
    const close = this.#hostClose;
    if (!close) return;
    this.#readyState = CLOSED;
    sockets.delete(this);
    if (close.clean) {
      log(`socket #${this.#id} closed by the fake host (${close.code} ${close.reason})`);
    } else {
      log(`socket #${this.#id} dropped by the fake host`);
      this.#fire(new Event("error"));
    }
    this.#fire(closeEvent(close.code, close.reason, close.clean));
  }

  #fire(event: Event): void {
    this.dispatchEvent(event);
    const handler = { open: this.onopen, message: this.onmessage, error: this.onerror, close: this.onclose }[
      event.type
    ] as ((this: WebSocket, event: Event) => unknown) | null | undefined;
    handler?.call(this, event);
  }
}
