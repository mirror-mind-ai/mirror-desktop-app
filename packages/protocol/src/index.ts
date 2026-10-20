// The contract between the Mirror Desktop host (a Node process embedding Pi
// and the Mirror core) and the UI (the Tauri webview).
//
// Every message crossing the local socket is validated against these schemas
// on both sides, so a drift between host and UI fails at the boundary with a
// named error instead of deep inside a screen. The same schemas back the fake
// host used by UI tests, which is how the UI is proven without a real Pi.
//
// Shape: the client sends requests carrying an `id`; the host answers each
// with a response carrying the same `id`. Host events carry no `id` — they
// describe session activity, not one request. (This mirrors Pi's own RPC
// convention, so an event from Pi can be forwarded with minimal translation.)

import { z } from "zod";

/** Bumped on any breaking change to the schemas below. */
export const PROTOCOL_VERSION = "0.2.0";

// --- Client → host --------------------------------------------------------

/**
 * The first message on a connection. The token is minted by the shell per
 * launch and handed to both sides; a connection that cannot present it is
 * closed before any other request is read.
 */
export const HelloRequest = z.object({
  type: z.literal("hello"),
  token: z.string().min(1),
  protocolVersion: z.string(),
});

/** Liveness probe; the host answers with its uptime. */
export const PingRequest = z.object({
  type: z.literal("ping"),
});

/**
 * Open a Pi session for a working directory — a Journey's project path. The
 * session is persistent and lives where terminal Pi keeps its own, so the
 * two can see each other's conversations.
 */
export const SessionOpenRequest = z.object({
  type: z.literal("session.open"),
  cwd: z.string().min(1),
});

/** Send a user prompt to an open session. Accepted, not completed: follow the events. */
export const SessionPromptRequest = z.object({
  type: z.literal("session.prompt"),
  sessionId: z.string().min(1),
  text: z.string().min(1),
});

export const SessionAbortRequest = z.object({
  type: z.literal("session.abort"),
  sessionId: z.string().min(1),
});

export const SessionCloseRequest = z.object({
  type: z.literal("session.close"),
  sessionId: z.string().min(1),
});

export const ClientRequestBody = z.discriminatedUnion("type", [
  HelloRequest,
  PingRequest,
  SessionOpenRequest,
  SessionPromptRequest,
  SessionAbortRequest,
  SessionCloseRequest,
]);

export const ClientRequest = z.object({
  id: z.string().min(1),
  request: ClientRequestBody,
});

// --- Host → client: responses --------------------------------------------

/** What the host is made of; shown in About and recorded in diagnostics. */
export const HostIdentity = z.object({
  /** Minted per host process; a changed id after reconnect means the host restarted. */
  instanceId: z.string().min(1),
  protocolVersion: z.string(),
  node: z.string(),
  pi: z.string(),
  mirror: z.string(),
});

export const HelloResult = z.object({
  type: z.literal("hello"),
  host: HostIdentity,
});

export const PingResult = z.object({
  type: z.literal("ping"),
  uptimeMs: z.number().nonnegative(),
});

export const ModelRef = z.object({
  provider: z.string(),
  id: z.string(),
});

export const SessionOpenResult = z.object({
  type: z.literal("session.open"),
  sessionId: z.string().min(1),
  /** Pi's own session file; the same path the Mirror logger records against. */
  sessionFile: z.string().min(1),
  cwd: z.string().min(1),
  model: ModelRef.optional(),
  thinkingLevel: z.string(),
  /** Resources that failed to load for this session, one line each; empty when all loaded. */
  diagnostics: z.array(z.string()),
});

export const SessionPromptResult = z.object({
  type: z.literal("session.prompt"),
  sessionId: z.string().min(1),
});

export const SessionAbortResult = z.object({
  type: z.literal("session.abort"),
  sessionId: z.string().min(1),
});

export const SessionCloseResult = z.object({
  type: z.literal("session.close"),
  sessionId: z.string().min(1),
});

export const HostResultBody = z.discriminatedUnion("type", [
  HelloResult,
  PingResult,
  SessionOpenResult,
  SessionPromptResult,
  SessionAbortResult,
  SessionCloseResult,
]);

/** Named, bounded failure. Never carries raw exceptions, paths or secrets. */
export const HostError = z.object({
  code: z.enum([
    "unauthorized",
    "unsupported_protocol_version",
    "malformed_request",
    "session_not_found",
    "session_open_failed",
    "session_busy",
    "internal_failure",
  ]),
  message: z.string(),
});

export const HostResponse = z.object({
  id: z.string().min(1),
  result: HostResultBody.optional(),
  error: HostError.optional(),
});

// --- Host → client: events -----------------------------------------------

/**
 * The projection of Pi's session events the UI renders. Deliberately explicit:
 * an event Pi emits that is not listed here is not forwarded, so the UI never
 * depends on a shape nobody wrote down. Grows one member at a time.
 */
export const SessionEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent_start") }),
  z.object({ type: z.literal("agent_end") }),
  z.object({ type: z.literal("agent_settled"), aborted: z.boolean() }),
  z.object({ type: z.literal("message_start"), role: z.string() }),
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("thinking_delta"), delta: z.string() }),
  z.object({
    type: z.literal("message_end"),
    role: z.string(),
    text: z.string(),
    stopReason: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_start"),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_end"),
    toolCallId: z.string(),
    toolName: z.string(),
    isError: z.boolean(),
    durationMs: z.number().optional(),
    resultText: z.string(),
  }),
  z.object({
    type: z.literal("retry"),
    attempt: z.number(),
    maxAttempts: z.number(),
    delayMs: z.number(),
    errorMessage: z.string(),
  }),
  z.object({
    type: z.literal("queue_update"),
    steering: z.array(z.string()),
    followUp: z.array(z.string()),
  }),
]);

/** Session activity the host pushes without being asked. */
export const HostEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("host.ready") }),
  z.object({
    type: z.literal("session.event"),
    sessionId: z.string().min(1),
    /** Host clock, ms since epoch, when the event left Pi. */
    at: z.number(),
    event: SessionEvent,
  }),
  /** An extension failed inside Pi; the turn goes on, the UI may say so. */
  z.object({
    type: z.literal("session.extension_error"),
    sessionId: z.string().min(1),
    extension: z.string(),
    event: z.string(),
    message: z.string(),
  }),
]);

/** Anything the host writes to the socket. */
export const HostMessage = z.union([HostResponse, HostEvent]);

// --- Types ----------------------------------------------------------------

export type HelloRequest = z.infer<typeof HelloRequest>;
export type PingRequest = z.infer<typeof PingRequest>;
export type SessionOpenRequest = z.infer<typeof SessionOpenRequest>;
export type SessionPromptRequest = z.infer<typeof SessionPromptRequest>;
export type ClientRequestBody = z.infer<typeof ClientRequestBody>;
export type ClientRequest = z.infer<typeof ClientRequest>;
export type HostIdentity = z.infer<typeof HostIdentity>;
export type ModelRef = z.infer<typeof ModelRef>;
export type SessionOpenResult = z.infer<typeof SessionOpenResult>;
export type HostResultBody = z.infer<typeof HostResultBody>;
export type HostError = z.infer<typeof HostError>;
export type HostResponse = z.infer<typeof HostResponse>;
export type SessionEvent = z.infer<typeof SessionEvent>;
export type HostEvent = z.infer<typeof HostEvent>;
export type HostMessage = z.infer<typeof HostMessage>;
