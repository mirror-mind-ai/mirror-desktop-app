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

/**
 * Bumped on any breaking change to the schemas below. A new field is one:
 * zod strips a field it does not know, so an older host would quietly ignore
 * it (an old host given `sessionFile` would open a new session instead of
 * resuming). The version, checked at hello, is what refuses the mismatch.
 */
export const PROTOCOL_VERSION = "0.5.0";

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

/** The Journeys Mirror knows, for the picker. */
export const JourneysListRequest = z.object({
  type: z.literal("journeys.list"),
});

/**
 * Open a Pi session for a Journey — in its project path, with its Mirror
 * conversation bound from the first message — or for a bare directory. The
 * session is persistent and lives where terminal Pi keeps its own, so the
 * two can see each other's conversations.
 *
 * With `sessionFile`, the session resumed is that file, one of the Journey's
 * sessions; without it, a new one. A Journey has one open session at a time:
 * opening another closes the one before, so the UI never asks to close it.
 */
export const SessionOpenRequest = z
  .object({
    type: z.literal("session.open"),
    journey: z.string().min(1).optional(),
    /** Required without a Journey; with one, overrides the Journey's project path. */
    cwd: z.string().min(1).optional(),
    sessionFile: z.string().min(1).optional(),
  })
  .refine((request) => request.journey !== undefined || request.cwd !== undefined, {
    message: "session.open needs a journey or a cwd",
  })
  .refine((request) => request.sessionFile === undefined || request.journey !== undefined, {
    message: "session.open resumes a session file only for a Journey",
  });

/**
 * A Journey's sessions: the files terminal Pi keeps for the Journey's
 * project path, newest first, the same files `pi -r` lists there. A read:
 * nothing is opened and nothing is written to Mirror, so looking costs
 * nothing (D14).
 */
export const SessionsListRequest = z.object({
  type: z.literal("sessions.list"),
  journey: z.string().min(1),
});

/**
 * One of a Journey's sessions, as rows to draw: the end of its branch, read
 * from the file. A read, like the list. The host refuses a file that is not
 * one of the Journey's sessions.
 */
export const SessionTranscriptRequest = z.object({
  type: z.literal("session.transcript"),
  journey: z.string().min(1),
  sessionFile: z.string().min(1),
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

// --- Provider authentication ---------------------------------------------
//
// Pi owns the flows (OAuth with a loopback callback, device codes, API keys)
// and the credential store (`~/.pi/agent/auth.json`, shared with terminal
// Pi). The host runs a flow and bridges its two needs to the UI: things to
// show (`auth.event`) and questions to answer (`auth.prompt` → `auth.answer`).

export const AuthType = z.enum(["oauth", "api_key"]);

/** The providers Pi knows, with whether and how each is signed in. */
export const AuthProvidersRequest = z.object({
  type: z.literal("auth.providers"),
});

/** Start a sign-in flow. The response arrives when the flow ends, either way. */
export const AuthLoginRequest = z.object({
  type: z.literal("auth.login"),
  providerId: z.string().min(1),
  authType: AuthType,
});

/** Answer a question the flow asked through an `auth.prompt` event. */
export const AuthAnswerRequest = z.object({
  type: z.literal("auth.answer"),
  promptId: z.string().min(1),
  value: z.string(),
});

/** Abandon the provider's running flow; its `auth.login` then fails as cancelled. */
export const AuthCancelRequest = z.object({
  type: z.literal("auth.cancel"),
  providerId: z.string().min(1),
});

/** Forget the stored credential of a provider. */
export const AuthLogoutRequest = z.object({
  type: z.literal("auth.logout"),
  providerId: z.string().min(1),
});

/** Models a request can be sent to right now, given the credentials in place. */
export const ModelsAvailableRequest = z.object({
  type: z.literal("models.available"),
});

export const ClientRequestBody = z.discriminatedUnion("type", [
  HelloRequest,
  PingRequest,
  JourneysListRequest,
  SessionOpenRequest,
  SessionsListRequest,
  SessionTranscriptRequest,
  SessionPromptRequest,
  SessionAbortRequest,
  SessionCloseRequest,
  AuthProvidersRequest,
  AuthLoginRequest,
  AuthAnswerRequest,
  AuthCancelRequest,
  AuthLogoutRequest,
  ModelsAvailableRequest,
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

export const Journey = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  description: z.string(),
  projectPath: z.string().optional(),
  parent: z.string().optional(),
});

export const JourneysListResult = z.object({
  type: z.literal("journeys.list"),
  journeys: z.array(Journey),
});

export const SessionOpenResult = z.object({
  type: z.literal("session.open"),
  sessionId: z.string().min(1),
  /** Pi's own session file; the same path the Mirror logger records against. */
  sessionFile: z.string().min(1),
  cwd: z.string().min(1),
  /** The Journey the session was opened for and its Mirror conversation, once bound. */
  journey: z.string().optional(),
  mirrorConversationId: z.string().optional(),
  model: ModelRef.optional(),
  thinkingLevel: z.string(),
  /** Resources that failed to load for this session, one line each; empty when all loaded. */
  diagnostics: z.array(z.string()),
});

/** One of a Journey's sessions, as the list shows it. */
export const SessionSummary = z.object({
  /** Pi's session file: what a transcript read and a resume name. */
  file: z.string().min(1),
  id: z.string().min(1),
  /** Its name, else its first message's first line; bounded, with no control characters. */
  title: z.string(),
  /** When it began (its header) and when its file last changed, in ms since epoch. */
  created: z.number(),
  modified: z.number(),
});

export const SessionsListResult = z.object({
  type: z.literal("sessions.list"),
  journey: z.string(),
  sessions: z.array(SessionSummary),
});

/**
 * What a session holds, as the transcript draws it. A tool call carries its
 * result; a text the host's bound cut ends with a line saying so.
 */
export const TranscriptEntry = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), text: z.string() }),
  z.object({
    kind: z.literal("assistant"),
    text: z.string(),
    thinking: z.string(),
    stopReason: z.string().optional(),
    errorMessage: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tool"),
    toolCallId: z.string(),
    name: z.string(),
    args: z.unknown(),
    /** Absent when the file holds the call and no result: the turn ended before the tool did. */
    result: z.string().optional(),
    isError: z.boolean().optional(),
    durationMs: z.number().optional(),
  }),
  /** A message an extension chose to show (Pi's displayed custom message), named by its type. */
  z.object({ kind: z.literal("notice"), name: z.string(), text: z.string() }),
]);

export const SessionTranscriptResult = z.object({
  type: z.literal("session.transcript"),
  sessionFile: z.string(),
  entries: z.array(TranscriptEntry),
  /** The user and assistant messages before the first entry, left out by the host's bound. */
  earlier: z.number().int().nonnegative(),
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

export const AuthProvider = z.object({
  id: z.string(),
  name: z.string(),
  /** How this provider can be signed into; a provider may offer both. */
  oauth: z
    .object({
      label: z.string(),
      /** Backed by a consumer subscription (Claude Pro/Max, ChatGPT Plus/Pro) rather than pay-per-use. */
      subscription: z.boolean(),
    })
    .optional(),
  apiKey: z.object({ label: z.string() }).optional(),
  /** Present when a credential is in place, with where it came from. */
  signedIn: z
    .object({
      authType: AuthType,
      source: z.string().optional(),
    })
    .optional(),
});

export const AuthProvidersResult = z.object({
  type: z.literal("auth.providers"),
  providers: z.array(AuthProvider),
});

export const AuthLoginResult = z.object({
  type: z.literal("auth.login"),
  providerId: z.string(),
  authType: AuthType,
});

export const AuthAnswerResult = z.object({ type: z.literal("auth.answer"), promptId: z.string() });
export const AuthCancelResult = z.object({ type: z.literal("auth.cancel"), providerId: z.string() });
export const AuthLogoutResult = z.object({ type: z.literal("auth.logout"), providerId: z.string() });

export const AvailableModel = z.object({
  provider: z.string(),
  id: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
});

export const ModelsAvailableResult = z.object({
  type: z.literal("models.available"),
  models: z.array(AvailableModel),
});

export const HostResultBody = z.discriminatedUnion("type", [
  HelloResult,
  PingResult,
  JourneysListResult,
  SessionOpenResult,
  SessionsListResult,
  SessionTranscriptResult,
  SessionPromptResult,
  SessionAbortResult,
  SessionCloseResult,
  AuthProvidersResult,
  AuthLoginResult,
  AuthAnswerResult,
  AuthCancelResult,
  AuthLogoutResult,
  ModelsAvailableResult,
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
    "sessions_unreadable",
    "mirror_not_configured",
    "journey_not_found",
    "journey_has_no_project_path",
    "auth_provider_not_found",
    "auth_in_progress",
    "auth_prompt_not_found",
    "auth_failed",
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

/** What a sign-in flow wants shown. Mirrors Pi's `AuthEvent`. */
export const AuthFlowEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("info"),
    message: z.string(),
    links: z.array(z.object({ url: z.string(), label: z.string().optional() })).optional(),
  }),
  /** Open this in the system browser; the flow is listening for the callback. */
  z.object({ type: z.literal("auth_url"), url: z.string(), instructions: z.string().optional() }),
  z.object({
    type: z.literal("device_code"),
    userCode: z.string(),
    verificationUri: z.string(),
    intervalSeconds: z.number().optional(),
    expiresInSeconds: z.number().optional(),
  }),
  z.object({ type: z.literal("progress"), message: z.string() }),
]);

/** A question a sign-in flow asks. Mirrors Pi's `AuthPrompt`, minus its abort signal. */
export const AuthFlowPrompt = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), message: z.string(), placeholder: z.string().optional() }),
  z.object({ type: z.literal("secret"), message: z.string(), placeholder: z.string().optional() }),
  z.object({
    type: z.literal("select"),
    message: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().optional() })),
  }),
  /** The callback may still arrive on its own; the prompt is closed by `auth.prompt_closed` when it does. */
  z.object({ type: z.literal("manual_code"), message: z.string(), placeholder: z.string().optional() }),
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
  z.object({ type: z.literal("auth.event"), providerId: z.string(), event: AuthFlowEvent }),
  z.object({ type: z.literal("auth.prompt"), providerId: z.string(), promptId: z.string(), prompt: AuthFlowPrompt }),
  /** The flow no longer needs this answer (the browser callback arrived, or the flow ended). */
  z.object({ type: z.literal("auth.prompt_closed"), promptId: z.string() }),
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
export type SessionSummary = z.infer<typeof SessionSummary>;
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;
export type Journey = z.infer<typeof Journey>;
export type HostResultBody = z.infer<typeof HostResultBody>;
export type HostError = z.infer<typeof HostError>;
export type HostResponse = z.infer<typeof HostResponse>;
export type SessionEvent = z.infer<typeof SessionEvent>;
export type AuthType = z.infer<typeof AuthType>;
export type AuthProvider = z.infer<typeof AuthProvider>;
export type AvailableModel = z.infer<typeof AvailableModel>;
export type AuthFlowEvent = z.infer<typeof AuthFlowEvent>;
export type AuthFlowPrompt = z.infer<typeof AuthFlowPrompt>;
export type HostEvent = z.infer<typeof HostEvent>;
export type HostMessage = z.infer<typeof HostMessage>;
