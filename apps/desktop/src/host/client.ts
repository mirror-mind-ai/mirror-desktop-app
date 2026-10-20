// The UI's door to the host.
//
// One WebSocket to the loopback port the shell announced, authenticated with
// the per-launch token. Requests are correlated by id; events are delivered to
// one listener. Every message in and out is validated against the protocol,
// so a host and a UI that disagree fail here, by name.

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

export class HostRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HostRequestError";
  }
}

type Resolver = (message: Extract<HostMessage, { id: string }>) => void;

export class HostClient {
  readonly #socket: WebSocket;
  readonly #pending = new Map<string, Resolver>();
  #nextId = 1;
  onEvent: (event: HostEvent) => void = () => {};

  private constructor(socket: WebSocket) {
    this.#socket = socket;
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
    const id = String(this.#nextId++);
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (message) => {
        if (message.error) reject(new HostRequestError(message.error.code, message.error.message));
        else if (message.result) resolve(message.result);
        else reject(new HostRequestError("internal_failure", "The host answered with neither result nor error."));
      });
      this.#socket.send(JSON.stringify({ id, request: body }));
    });
  }

  close(): void {
    this.#socket.close();
  }
}
