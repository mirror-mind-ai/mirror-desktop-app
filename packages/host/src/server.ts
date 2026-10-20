// The Mirror Desktop host server. Started by main.ts, never directly.
//
// One long-lived Node process, spawned and supervised by the Tauri shell. It
// embeds Pi (the agent) and the Mirror core (identity, memory, journeys) as
// libraries and serves the UI over a loopback WebSocket. Nothing in the hot
// path crosses Rust: the shell starts the host, hands it a per-launch token,
// reads the port the host chose, and gives both to the webview.
//
// This file is the scaffold: it proves that Pi and the Mirror core load in one
// process, authenticates connections, and answers `hello` and `ping`. Sessions,
// journeys and events arrive with the spikes that follow.
//
// Runs with no build step: Node 24 strips types from `.ts` files directly,
// the same way the Mirror core runs.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

import { VERSION as PI_VERSION } from "@earendil-works/pi-coding-agent";
import {
  ClientRequest,
  type HostError,
  type HostMessage,
  type HostResultBody,
  PROTOCOL_VERSION,
} from "@mirror-desktop/protocol";
// The Mirror core ships no package entry point yet (`mirror-mind` has neither
// `main` nor `exports`), so its public API is reached by path. Making
// `import "mirror-mind"` work is the first Core-owned prerequisite recorded in
// docs/project/history/predecessor.md. Importing the public surface here is
// the scaffold's proof that the core loads in-process beside Pi.
import { newId } from "mirror-mind/ts/src/index.ts";
import { WebSocket, WebSocketServer } from "ws";

const MIRROR_PACKAGE_JSON = new URL(import.meta.resolve("mirror-mind/package.json"));
const MIRROR_VERSION = (JSON.parse(readFileSync(MIRROR_PACKAGE_JSON, "utf8")) as { version: string })
  .version;

/** The shell passes the token through the environment, never through argv (visible in `ps`). */
const TOKEN = process.env.MIRROR_HOST_TOKEN;
if (!TOKEN) {
  process.stderr.write("mirror-host: MIRROR_HOST_TOKEN is required\n");
  process.exit(2);
}

const startedAt = Date.now();
const instanceId = newId();

function error(code: HostError["code"], message: string): HostError {
  return { code, message };
}

function send(socket: WebSocket, message: HostMessage): void {
  socket.send(JSON.stringify(message));
}

function handle(request: ClientRequest["request"], authenticated: boolean): HostResultBody | HostError {
  switch (request.type) {
    case "hello":
      if (request.token !== TOKEN) return error("unauthorized", "The host did not recognize this token.");
      if (request.protocolVersion !== PROTOCOL_VERSION) {
        return error(
          "unsupported_protocol_version",
          `The host speaks protocol ${PROTOCOL_VERSION}; the client asked for ${request.protocolVersion}.`,
        );
      }
      return {
        type: "hello",
        host: {
          instanceId,
          protocolVersion: PROTOCOL_VERSION,
          node: process.version,
          pi: PI_VERSION,
          mirror: MIRROR_VERSION,
        },
      };
    case "ping":
      if (!authenticated) return error("unauthorized", "Say hello first.");
      return { type: "ping", uptimeMs: Date.now() - startedAt };
  }
}

const httpServer = createServer();
const server = new WebSocketServer({ server: httpServer });

server.on("connection", (socket) => {
  let authenticated = false;
  socket.on("message", (raw) => {
    const parsed = ClientRequest.safeParse(safeJson(raw.toString()));
    if (!parsed.success) {
      send(socket, { id: "?", error: error("malformed_request", "The request did not match the protocol.") });
      return;
    }
    const { id, request } = parsed.data;
    const outcome = handle(request, authenticated);
    if ("code" in outcome) {
      send(socket, { id, error: outcome });
      if (outcome.code === "unauthorized") socket.close(4401, "unauthorized");
      return;
    }
    if (outcome.type === "hello") authenticated = true;
    send(socket, { id, result: outcome });
  });
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Loopback only, ephemeral port: the shell reads the one line below from
// stdout and passes it to the webview. Nothing else is ever written to stdout.
httpServer.listen(0, "127.0.0.1", () => {
  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.stdout.write(`${JSON.stringify({ event: "listening", port, protocolVersion: PROTOCOL_VERSION })}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    httpServer.close(() => process.exit(0));
  });
}
