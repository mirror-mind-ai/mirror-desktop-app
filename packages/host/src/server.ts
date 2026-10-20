// The Mirror Desktop host server. Started by main.ts, never directly.
//
// One long-lived Node process, spawned and supervised by the Tauri shell. It
// embeds Pi (the agent) and the Mirror core (identity, memory, journeys) as
// libraries and serves the UI over a loopback WebSocket. Nothing in the hot
// path crosses Rust: the shell starts the host, hands it a per-launch token,
// reads the port the host chose, and gives both to the webview.
//
// Requests are answered one by one per connection; session events are fanned
// out to every authenticated connection as they leave Pi (see sessions.ts).
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

import { materializeRuntimeBin } from "./runtimeBin.ts";
import { SessionBusyError, SessionNotFoundError, SessionOpenError, SessionRegistry } from "./sessions.ts";

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
const runtimeBin = materializeRuntimeBin();
process.stderr.write(`mirror-host: runtime ${process.execPath} · bin ${runtimeBin}\n`);
const sessions = new SessionRegistry();
const authenticatedSockets = new Set<WebSocket>();

function error(code: HostError["code"], message: string): HostError {
  return { code, message };
}

function send(socket: WebSocket, message: HostMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

sessions.subscribe((event) => {
  for (const socket of authenticatedSockets) send(socket, event);
});

async function handle(
  request: ClientRequest["request"],
  authenticated: boolean,
): Promise<HostResultBody | HostError> {
  if (request.type === "hello") {
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
  }
  if (!authenticated) return error("unauthorized", "Say hello first.");

  try {
    switch (request.type) {
      case "ping":
        return { type: "ping", uptimeMs: Date.now() - startedAt };
      case "session.open":
        return await sessions.open(request.cwd);
      case "session.prompt":
        sessions.prompt(request.sessionId, request.text);
        return { type: "session.prompt", sessionId: request.sessionId };
      case "session.abort":
        await sessions.abort(request.sessionId);
        return { type: "session.abort", sessionId: request.sessionId };
      case "session.close":
        await sessions.close(request.sessionId);
        return { type: "session.close", sessionId: request.sessionId };
    }
  } catch (cause) {
    return failureOf(cause);
  }
}

/** Typed session failures become named protocol errors; anything else is an internal failure without its details. */
function failureOf(cause: unknown): HostError {
  if (cause instanceof SessionNotFoundError) return error("session_not_found", cause.message);
  if (cause instanceof SessionBusyError) return error("session_busy", cause.message);
  if (cause instanceof SessionOpenError) return error("session_open_failed", cause.message);
  process.stderr.write(`mirror-host: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`);
  return error("internal_failure", "The host could not complete the request.");
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
    void handle(request, authenticated).then((outcome) => {
      if ("code" in outcome) {
        send(socket, { id, error: outcome });
        if (outcome.code === "unauthorized") socket.close(4401, "unauthorized");
        return;
      }
      if (outcome.type === "hello") {
        authenticated = true;
        authenticatedSockets.add(socket);
      }
      send(socket, { id, result: outcome });
    });
  });
  socket.on("close", () => authenticatedSockets.delete(socket));
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

// Sessions close first so every extension sees `session_shutdown` before the
// process goes; a close that hangs is cut short after a bound, never waited on.
function shutdown(): void {
  const closing = sessions.closeAll();
  const bound = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
  void Promise.race([closing, bound]).then(() => {
    server.close();
    httpServer.close(() => process.exit(0));
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, shutdown);
}

// The shell holds the other end of stdin for as long as it lives. When it
// dies — cleanly or not — the pipe closes, and a host nobody can reach must
// not outlive it: an orphaned host keeps sessions and the Mirror database
// open with no window to show for them.
process.stdin.on("end", shutdown);
process.stdin.on("error", shutdown);
process.stdin.resume();
