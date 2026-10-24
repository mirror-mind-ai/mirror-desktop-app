// The UI's door to the host.
//
// One WebSocket to the loopback port the shell announced, authenticated with
// the per-launch token. Requests are correlated by id; events are delivered to
// one listener. Every message in and out is validated against the protocol,
// so a host and a UI that disagree fail here, by name.
//
// The connection's end is a failure with a name too. When the socket closes,
// everything still waiting on it rejects with ConnectionLostError, and the
// close is reported to one listener, unless the UI asked for it: then there
// is nothing to report. A killed host process arrives as an unclean close
// (1006, no reason) and is worded as a loss; a close the host chose carries
// its code and reason.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  type ClientRequestBody,
  type HostEvent,
  type HostIdentity,
  HostMessage,
  type HostResultBody,
  PROTOCOL_VERSION,
} from "@mirror-desktop/protocol";

export interface HostEndpoint {
  port: number;
  token: string;
}

/** The endpoint the shell handed us: already known, or announced shortly after launch. */
export async function hostEndpoint(): Promise<HostEndpoint> {
  const known = await invoke<HostEndpoint | null>("host_endpoint");
  if (known) return known;
  return new Promise((resolve) => {
    void listen<HostEndpoint>("host-ready", (event) => resolve(event.payload)).then((unlisten) => {
      // The announcement may have landed between the invoke and the listen.
      void invoke<HostEndpoint | null>("host_endpoint").then((late) => {
        if (late) {
          unlisten();
          resolve(late);
        }
      });
    });
  });
}

/** What the app's state needs of a connection to the host. HostClient is one; store tests pass a stub. */
export type HostConnection = Pick<HostClient, "request" | "close" | "onEvent" | "onClose">;

/**
 * A failure as the screens name it: the host's own code and words, a lost
 * connection by its name, or an internal failure in its own words.
 */
export function failureOf(error: unknown): { code: string; message: string } {
  if (error instanceof HostRequestError || error instanceof ConnectionLostError) return { code: error.code, message: error.message };
  return { code: "internal_failure", message: error instanceof Error ? error.message : String(error) };
}

/** The connection to the host ended. Not the host's answer, so not a HostError: its own name. */
export class ConnectionLostError extends Error {
  readonly code = "connection_lost";
  constructor(
    readonly wasClean: boolean,
    readonly closeCode: number,
    readonly reason: string,
  ) {
    super(connectionLostMessage(wasClean, closeCode, reason));
    this.name = "ConnectionLostError";
  }
}

/** A loss has no words of the host's; a close the host chose is said with its code, and its reason when it gave one. */
function connectionLostMessage(wasClean: boolean, code: number, reason: string): string {
  if (!wasClean) return "The connection to the host was lost.";
  return `The host closed the connection (${reason ? `${code} ${reason}` : String(code)}).`;
}

export class HostRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HostRequestError";
  }
}

type Resolver = (outcome: Extract<HostMessage, { id: string }> | ConnectionLostError) => void;

export class HostClient {
  readonly #socket: WebSocket;
  readonly #pending = new Map<string, Resolver>();
  #nextId = 1;
  #closedByUs = false;
  #lost: ConnectionLostError | null = null;
  onEvent: (event: HostEvent) => void = () => {};
  /** The connection ended without the UI asking. */
  onClose: (lost: ConnectionLostError) => void = () => {};

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("close", (event) => {
      const lost = new ConnectionLostError(event.wasClean, event.code, event.reason);
      this.#lost = lost;
      const waiting = [...this.#pending.values()];
      this.#pending.clear();
      for (const settle of waiting) settle(lost);
      if (!this.#closedByUs) this.onClose(lost);
    });
    socket.addEventListener("message", (raw) => {
      const parsed = HostMessage.safeParse(JSON.parse(String(raw.data)));
      if (!parsed.success) return;
      const message = parsed.data;
      if ("id" in message) {
        this.#pending.get(message.id)?.(message);
        this.#pending.delete(message.id);
      } else {
        this.onEvent(message);
      }
    });
  }

  /** Connect and say hello; resolves with what the host is made of. */
  static async connect(endpoint: HostEndpoint): Promise<{ client: HostClient; host: HostIdentity }> {
    const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("The host did not accept the connection.")), {
        once: true,
      });
    });
    const client = new HostClient(socket);
    const hello = await client.request({ type: "hello", token: endpoint.token, protocolVersion: PROTOCOL_VERSION });
    if (hello.type !== "hello") throw new Error("The host answered hello with something else.");
    return { client, host: hello.host };
  }

  request(body: ClientRequestBody): Promise<HostResultBody> {
    if (this.#lost) return Promise.reject(this.#lost);
    const id = String(this.#nextId++);
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (message) => {
        if (message instanceof ConnectionLostError) reject(message);
        else if (message.error) reject(new HostRequestError(message.error.code, message.error.message));
        else if (message.result) resolve(message.result);
        else reject(new HostRequestError("internal_failure", "The host answered with neither result nor error."));
      });
      this.#socket.send(JSON.stringify({ id, request: body }));
    });
  }

  close(): void {
    this.#closedByUs = true;
    this.#socket.close();
  }
}
