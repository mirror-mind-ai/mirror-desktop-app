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
export const PROTOCOL_VERSION = "0.1.0";

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

export const ClientRequestBody = z.discriminatedUnion("type", [HelloRequest, PingRequest]);

export const ClientRequest = z.object({
  id: z.string().min(1),
  request: ClientRequestBody,
});

// --- Host → client --------------------------------------------------------

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

export const HostResultBody = z.discriminatedUnion("type", [HelloResult, PingResult]);

/** Named, bounded failure. Never carries raw exceptions, paths or secrets. */
export const HostError = z.object({
  code: z.enum([
    "unauthorized",
    "unsupported_protocol_version",
    "malformed_request",
    "internal_failure",
  ]),
  message: z.string(),
});

export const HostResponse = z.object({
  id: z.string().min(1),
  result: HostResultBody.optional(),
  error: HostError.optional(),
});

/** Session activity the host pushes without being asked. Grows with the spikes. */
export const HostEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("host.ready") }),
]);

/** Anything the host writes to the socket. */
export const HostMessage = z.union([HostResponse, HostEvent]);

// --- Types ----------------------------------------------------------------

export type HelloRequest = z.infer<typeof HelloRequest>;
export type PingRequest = z.infer<typeof PingRequest>;
export type ClientRequestBody = z.infer<typeof ClientRequestBody>;
export type ClientRequest = z.infer<typeof ClientRequest>;
export type HostIdentity = z.infer<typeof HostIdentity>;
export type HostResultBody = z.infer<typeof HostResultBody>;
export type HostError = z.infer<typeof HostError>;
export type HostResponse = z.infer<typeof HostResponse>;
export type HostEvent = z.infer<typeof HostEvent>;
export type HostMessage = z.infer<typeof HostMessage>;
