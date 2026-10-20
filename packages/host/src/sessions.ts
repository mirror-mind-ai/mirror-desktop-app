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
//
// Pi's events are projected onto the protocol's `SessionEvent` union and
// handed to the server, which fans them out to authenticated clients.

import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { HostEvent, SessionEvent, SessionOpenResult } from "@mirror-desktop/protocol";

/** The installed Mirror package root; a Pi package (extension + skills) by its manifest. */
const MIRROR_PACKAGE_ROOT = new URL("./", import.meta.resolve("mirror-mind/package.json")).pathname.replace(
  /\/$/,
  "",
);

export type HostEventListener = (event: HostEvent) => void;

interface OpenSession {
  session: AgentSession;
  cwd: string;
  unsubscribe: () => void;
}

export class SessionOpenError extends Error {
  override readonly name = "SessionOpenError";
}

export class SessionNotFoundError extends Error {
  override readonly name = "SessionNotFoundError";
}

export class SessionBusyError extends Error {
  override readonly name = "SessionBusyError";
}

export class SessionRegistry {
  readonly #sessions = new Map<string, OpenSession>();
  readonly #listeners = new Set<HostEventListener>();

  /** Receive every event of every session; returns the unsubscribe function. */
  subscribe(listener: HostEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async open(cwd: string): Promise<SessionOpenResult> {
    const agentDir = getAgentDir();
    let session: AgentSession;
    try {
      const settingsManager = SettingsManager.create(cwd, agentDir);
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        additionalExtensionPaths: [MIRROR_PACKAGE_ROOT],
      });
      await resourceLoader.reload();
      const created = await createAgentSession({
        cwd,
        agentDir,
        settingsManager,
        resourceLoader,
        sessionManager: SessionManager.create(cwd),
      });
      session = created.session;
    } catch (cause) {
      throw new SessionOpenError(cause instanceof Error ? cause.message : String(cause), { cause });
    }

    const sessionId = session.sessionId;
    const unsubscribe = session.subscribe((event) => {
      const projected = projectEvent(event);
      if (projected) this.#emit({ type: "session.event", sessionId, at: Date.now(), event: projected });
    });
    this.#sessions.set(sessionId, { session, cwd, unsubscribe });

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
    const model = session.model;
    return {
      type: "session.open",
      sessionId,
      sessionFile,
      cwd,
      ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
      thinkingLevel: session.thinkingLevel,
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

  #get(sessionId: string): OpenSession {
    const open = this.#sessions.get(sessionId);
    if (!open) throw new SessionNotFoundError(`No open session ${sessionId}.`);
    return open;
  }

  #emit(event: HostEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

/** Readable text of a message's content: a string, or the text blocks joined. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => {
      return typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text";
    })
    .map((block) => block.text)
    .join("\n");
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
