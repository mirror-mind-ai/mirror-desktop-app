// Pi sessions inside the host.
//
// One `AgentSession` per open working directory (a Journey's project path),
// created through Pi's SDK with the same discovery terminal Pi uses: the
// user's `~/.pi/agent` (auth, settings, packages, global extensions), the
// project's own `.pi/`, and — added by the host — the Mirror package, so that
// Mirror's logger extension and skills are present exactly as they are in a
// terminal session. Conversation logging into `memory.db` therefore happens
// through Mirror's own extension; the host never writes a conversation.
//
// Sessions persist where terminal Pi keeps them (`~/.pi/agent/sessions/<cwd>`),
// so a conversation started here can be resumed with `pi -r` and vice versa.
// An open names the session file to resume, one of the Journey's sessions
// (sessionIndex.ts checks it), or none for a new session. A Journey has one
// open session at a time: an open for it closes the one it had, first
// (sessionPolicy.ts says when an open is refused instead).
//
// Resuming binds a Mirror conversation the way `pi -r` does: the file's own
// conversation when it is still open, a new one when it ended.
//
// A session opened for a Journey is bound to it the way a terminal session
// is: every command the agent runs sees `MIRROR_SESSION_ID`, so a `mirror …`
// it runs binds to this session and no other; and at open the host runs
// `mirror mirror load` for the Journey, which binds the session's Mirror
// conversation before the first message and yields the Journey's context,
// carried in the system prompt from then on.
//
// Pi's events are projected onto the protocol's `SessionEvent` union and
// handed to the server, which fans them out to authenticated clients.

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  createBashToolDefinition,
  DefaultResourceLoader,
  getAgentDir,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { HostEvent, SessionEvent, SessionOpenResult } from "@mirror-desktop/protocol";
import { fileURLToPath } from "node:url";

import { bindSessionToJourney, conversationForSession, journeyProjectPath } from "./mirror.ts";
import { containedSessionFile } from "./sessionIndex.ts";
import { type OpenSessionFacts, planOpen, SessionBusyError } from "./sessionPolicy.ts";
import { textOf } from "./transcript.ts";

export { SessionBusyError };

/**
 * The installed Mirror package root; a Pi package (extension + skills) by its
 * manifest. Through `fileURLToPath`, never `URL.pathname`: inside
 * "Mirror Desktop.app" the latter yields `Mirror%20Desktop.app`, a path that
 * does not exist, and the package silently fails to load.
 */
const MIRROR_PACKAGE_ROOT = fileURLToPath(new URL("./", import.meta.resolve("mirror-mind/package.json"))).replace(
  /\/$/,
  "",
);

export type HostEventListener = (event: HostEvent) => void;

interface OpenSession {
  session: AgentSession;
  cwd: string;
  journey?: string;
  unsubscribe: () => void;
}

export interface OpenSessionRequest {
  journey?: string;
  cwd?: string;
  /** One of the Journey's session files, to resume; a new session without it. */
  sessionFile?: string;
}

export class SessionOpenError extends Error {
  override readonly name = "SessionOpenError";
}

export class SessionNotFoundError extends Error {
  override readonly name = "SessionNotFoundError";
}

/**
 * Mirror's logger extension registers once per PROCESS: a module-level guard
 * on `globalThis`, there to stop a terminal session that discovers the same
 * file twice from logging every turn twice. In a host that opens several
 * sessions in one process, the guard makes every session after the first
 * silent. Until the core scopes the guard per session (a Core-owned
 * prerequisite), the host clears it before each session loads its
 * extensions — and serializes session opening so two loads cannot race
 * over it. Within one load the guard still works as designed.
 */
const MIRROR_LOGGER_GUARD = "__mirrorLoggerRegistered";

export class SessionRegistry {
  readonly #sessions = new Map<string, OpenSession>();
  readonly #listeners = new Set<HostEventListener>();
  readonly #modelRuntime: ModelRuntime;
  #opening: Promise<unknown> = Promise.resolve();

  /** One model runtime for every session: a sign-in applies to the next turn, no restart. */
  constructor(modelRuntime: ModelRuntime) {
    this.#modelRuntime = modelRuntime;
  }

  /** Receive every event of every session; returns the unsubscribe function. */
  subscribe(listener: HostEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  open(request: OpenSessionRequest): Promise<SessionOpenResult> {
    const next = this.#opening.then(() => this.#open(request));
    this.#opening = next.catch(() => undefined);
    return next;
  }

  async #open(request: OpenSessionRequest): Promise<SessionOpenResult> {
    const journey = request.journey;
    const cwd = request.cwd ?? (journey ? journeyProjectPath(journey) : undefined);
    if (!cwd) throw new SessionOpenError("A session needs a Journey or a directory.");
    let resumed: string | undefined;
    if (request.sessionFile !== undefined) {
      if (!journey) throw new SessionOpenError("A session file is resumed only for a Journey.");
      resumed = await containedSessionFile(cwd, request.sessionFile);
    }
    // Refused before anything closes; then the Journey's open session, if any, is closed.
    const plan = planOpen(this.#facts(), { ...(journey ? { journey } : {}), ...(resumed ? { file: resumed } : {}) });
    for (const sessionId of plan.close) await this.close(sessionId);
    const agentDir = getAgentDir();
    let session: AgentSession;
    let diagnostics: string[] = [];
    // Filled once the Journey is bound; read by the system-prompt hook on every run.
    const journeyContext = { text: "" };
    try {
      const settingsManager = SettingsManager.create(cwd, agentDir);
      const sessionManager = resumed ? SessionManager.open(resumed, undefined, cwd) : SessionManager.create(cwd);
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        additionalExtensionPaths: [MIRROR_PACKAGE_ROOT],
        extensionFactories: [
          (pi) => {
            pi.on("before_agent_start", (event) => {
              if (!journey || !journeyContext.text) return;
              event.systemPromptOptions.contextFiles.push({
                path: `mirror://journey/${journey}`,
                content: journeyContext.text,
              });
            });
          },
        ],
      });
      delete (globalThis as Record<string, unknown>)[MIRROR_LOGGER_GUARD];
      await resourceLoader.reload();
      const created = await createAgentSession({
        cwd,
        agentDir,
        modelRuntime: this.#modelRuntime,
        settingsManager,
        resourceLoader,
        sessionManager,
        // The built-in bash tool, plus this session's identity for Mirror:
        // a `mirror …` the agent runs binds to this session by name instead
        // of guessing the most recent one — the guess that once moved other
        // Journeys' cursors in the predecessor.
        customTools: [
          // The cast is the SDK boundary: `customTools` takes the unparameterized
          // ToolDefinition, and the bash definition's typed schema does not widen to it.
          createBashToolDefinition(cwd, {
            spawnHook: (context) => {
              const sessionFile = sessionManager.getSessionFile();
              return sessionFile ? { ...context, env: { ...context.env, MIRROR_SESSION_ID: sessionFile } } : context;
            },
          }) as unknown as ToolDefinition,
        ],
      });
      session = created.session;
      // A resource that failed to load is a fact the UI must be able to show;
      // the Mirror package failing here means no conversation gets logged.
      diagnostics = created.extensionsResult.errors.map((failure) => `${failure.path}: ${failure.error}`);
      for (const line of diagnostics) process.stderr.write(`mirror-host: extension ${line}\n`);
    } catch (cause) {
      throw new SessionOpenError(cause instanceof Error ? cause.message : String(cause), { cause });
    }

    const sessionId = session.sessionId;
    const unsubscribe = session.subscribe((event) => {
      const projected = projectEvent(event);
      if (projected) this.#emit({ type: "session.event", sessionId, at: Date.now(), event: projected });
    });
    this.#sessions.set(sessionId, { session, cwd, ...(journey ? { journey } : {}), unsubscribe });

    // Emits `session_start` to every extension — the Mirror logger opens its
    // conversation here — with no TUI: `ctx.hasUI` is false, so extensions
    // that would draw stay silent instead of failing.
    await session.bindExtensions({
      mode: "rpc",
      onError: (failure) => {
        this.#emit({
          type: "session.extension_error",
          sessionId,
          extension: failure.extensionPath,
          event: failure.event,
          message: failure.error,
        });
      },
    });

    const sessionFile = session.sessionManager.getSessionFile();
    if (!sessionFile) {
      await this.close(sessionId);
      throw new SessionOpenError("Pi did not create a session file.");
    }

    // After `session_start`, which resets Mirror's global orientation: the
    // binding is per session and must not be reset by it.
    let mirrorConversationId: string | undefined;
    if (journey) {
      try {
        const binding = await bindSessionToJourney(sessionFile, journey);
        journeyContext.text = binding.context;
        mirrorConversationId = conversationForSession(sessionFile);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        diagnostics = [...diagnostics, `mirror: could not bind the session to Journey ${journey}: ${message}`];
        process.stderr.write(`mirror-host: ${diagnostics[diagnostics.length - 1]}\n`);
      }
    }

    const model = session.model;
    return {
      type: "session.open",
      sessionId,
      sessionFile,
      cwd,
      ...(journey ? { journey } : {}),
      ...(mirrorConversationId ? { mirrorConversationId } : {}),
      ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
      thinkingLevel: session.thinkingLevel,
      diagnostics,
    };
  }

  /**
   * Accept a prompt. The returned promise settles when the prompt is accepted,
   * not when the run ends; completion is announced by the `agent_settled`
   * event. A session that is already streaming refuses rather than guessing
   * between steering and following up — those are explicit requests later.
   */
  prompt(sessionId: string, text: string): void {
    const open = this.#get(sessionId);
    if (open.session.isStreaming) throw new SessionBusyError("The session is still answering.");
    open.session.prompt(text).catch((cause: unknown) => {
      this.#emit({
        type: "session.extension_error",
        sessionId,
        extension: "host",
        event: "prompt",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    });
  }

  async abort(sessionId: string): Promise<void> {
    await this.#get(sessionId).session.abort();
  }

  /**
   * Close the way Pi's own modes tear a session down: settle any active
   * response, tell the extensions (`session_shutdown` is where the Mirror
   * logger closes the conversation and backs up — `dispose()` alone never
   * emits it), then dispose.
   */
  async close(sessionId: string): Promise<void> {
    const open = this.#get(sessionId);
    this.#sessions.delete(sessionId);
    open.unsubscribe();
    try {
      await open.session.abort();
      if (open.session.extensionRunner.hasHandlers("session_shutdown")) {
        await open.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      }
    } finally {
      open.session.dispose();
    }
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.#sessions.keys()].map((id) => this.close(id)));
  }

  #facts(): OpenSessionFacts[] {
    return [...this.#sessions.entries()].map(([id, open]) => ({
      id,
      ...(open.journey ? { journey: open.journey } : {}),
      file: open.session.sessionManager.getSessionFile() ?? "",
      streaming: open.session.isStreaming,
    }));
  }

  #get(sessionId: string): OpenSession {
    const open = this.#sessions.get(sessionId);
    if (!open) throw new SessionNotFoundError(`No open session ${sessionId}.`);
    return open;
  }

  #emit(event: HostEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

/**
 * Pi event → protocol event. Returns undefined for events the contract does
 * not carry (turn boundaries, compaction, tool progress, …) until a screen
 * needs them and the schema gains a member for them.
 */
export function projectEvent(event: AgentSessionEvent): SessionEvent | undefined {
  switch (event.type) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end" };
    case "agent_settled":
      return { type: "agent_settled", aborted: event.aborted };
    case "message_start":
      return { type: "message_start", role: event.message.role };
    case "message_update": {
      const delta = event.assistantMessageEvent;
      if (delta.type === "text_delta") return { type: "text_delta", delta: delta.delta };
      if (delta.type === "thinking_delta") return { type: "thinking_delta", delta: delta.delta };
      return undefined;
    }
    case "message_end": {
      const message = event.message;
      return {
        type: "message_end",
        role: message.role,
        // Not every Pi message carries `content` (a bash execution record does not).
        text: textOf((message as { content?: unknown }).content),
        ...(message.role === "assistant" ? { stopReason: message.stopReason } : {}),
        ...(message.role === "assistant" && message.errorMessage ? { errorMessage: message.errorMessage } : {}),
      };
    }
    case "tool_execution_start":
      return { type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args };
    case "tool_execution_end":
      return {
        type: "tool_end",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        resultText: textOf((event.result as { content?: unknown } | undefined)?.content),
      };
    case "auto_retry_start":
      return {
        type: "retry",
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
        errorMessage: event.errorMessage,
      };
    case "queue_update":
      return { type: "queue_update", steering: [...event.steering], followUp: [...event.followUp] };
    default:
      return undefined;
  }
}
