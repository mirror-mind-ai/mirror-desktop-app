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

import {
  AuthBroker,
  AuthFailedError,
  AuthInProgressError,
  AuthPromptNotFoundError,
  AuthProviderNotFoundError,
} from "./auth.ts";
import {
  JourneyHasNoProjectPathError,
  JourneyNotFoundError,
  journeyProjectPath,
  listJourneys,
  loadMirrorConfiguration,
  MirrorNotConfiguredError,
} from "./mirror.ts";
import { materializeRuntimeBin } from "./runtimeBin.ts";
import { listSessions, SessionFileRefusedError, SessionsUnreadableError } from "./sessionIndex.ts";
import { SessionBusyError, SessionNotFoundError, SessionOpenError, SessionRegistry } from "./sessions.ts";
import { shutdownHost } from "./shutdown.ts";
import { readSessionTranscript } from "./transcript.ts";

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
// Mirror's configuration first: everything after this — the shims, the
// extension, every `mirror` the agent runs — inherits what it resolved.
loadMirrorConfiguration();
const runtimeBin = materializeRuntimeBin();
process.stderr.write(`mirror-host: runtime ${process.execPath} · bin ${runtimeBin}\n`);
const authenticatedSockets = new Set<WebSocket>();

function error(code: HostError["code"], message: string): HostError {
  return { code, message };
}

function send(socket: WebSocket, message: HostMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(event: HostMessage): void {
  for (const socket of authenticatedSockets) send(socket, event);
}

const auth = await AuthBroker.create(broadcast);
const sessions = new SessionRegistry(auth.modelRuntime);
sessions.subscribe(broadcast);

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
      case "journeys.list":
        return { type: "journeys.list", journeys: listJourneys() };
      case "session.open":
        return await sessions.open({
          ...(request.journey !== undefined ? { journey: request.journey } : {}),
          ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
          ...(request.sessionFile !== undefined ? { sessionFile: request.sessionFile } : {}),
        });
      // The two reads behind a look (D14): nothing is opened, nothing written to Mirror.
      case "sessions.list":
        return { type: "sessions.list", journey: request.journey, sessions: await listSessions(journeyProjectPath(request.journey)) };
      case "session.transcript": {
        const transcript = await readSessionTranscript(journeyProjectPath(request.journey), request.sessionFile);
        return { type: "session.transcript", sessionFile: request.sessionFile, ...transcript };
      }
      case "session.prompt":
        sessions.prompt(request.sessionId, request.text);
        return { type: "session.prompt", sessionId: request.sessionId };
      case "session.abort":
        await sessions.abort(request.sessionId);
        return { type: "session.abort", sessionId: request.sessionId };
      case "session.close":
        await sessions.close(request.sessionId);
        return { type: "session.close", sessionId: request.sessionId };
      case "auth.providers":
        return { type: "auth.providers", providers: auth.providers() };
      case "auth.login":
        await auth.login(request.providerId, request.authType);
        return { type: "auth.login", providerId: request.providerId, authType: request.authType };
      case "auth.answer":
        auth.answer(request.promptId, request.value);
        return { type: "auth.answer", promptId: request.promptId };
      case "auth.cancel":
        auth.cancel(request.providerId);
        return { type: "auth.cancel", providerId: request.providerId };
      case "auth.logout":
        await auth.logout(request.providerId);
        return { type: "auth.logout", providerId: request.providerId };
      case "models.available":
        return { type: "models.available", models: await auth.available() };
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
  if (cause instanceof SessionFileRefusedError) return error("session_open_failed", cause.message);
  if (cause instanceof SessionsUnreadableError) return error("sessions_unreadable", cause.message);
  if (cause instanceof MirrorNotConfiguredError) return error("mirror_not_configured", cause.message);
  if (cause instanceof JourneyNotFoundError) return error("journey_not_found", cause.message);
  if (cause instanceof JourneyHasNoProjectPathError) return error("journey_has_no_project_path", cause.message);
  if (cause instanceof AuthProviderNotFoundError) return error("auth_provider_not_found", cause.message);
  if (cause instanceof AuthInProgressError) return error("auth_in_progress", cause.message);
  if (cause instanceof AuthPromptNotFoundError) return error("auth_prompt_not_found", cause.message);
  if (cause instanceof AuthFailedError) return error("auth_failed", cause.message);
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

// Sessions close first, every connection is told goodbye, then the process
// goes; nothing is waited on without a bound (shutdown.ts). Once, whichever
// signal arrives first.
let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  void shutdownHost({
    closeSessions: () => sessions.closeAll(),
    server,
    httpServer,
    exit: () => process.exit(0),
    sessionsBoundMs: 10_000,
    goodbyeBoundMs: 2_000,
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
