// The transcript: one conversation's session events folded into the rows a
// screen renders. Data only: the rows keep what a turn produced (an answer's
// text and thinking, a tool call's arguments and result, a named notice), and
// how each is drawn is the transcript's (src/transcript/, CV1.DS1.US2).

import type { SessionEvent } from "@mirror-desktop/protocol";

/** How loud a notice is: the notice color, or the alarm's. */
export type NoticeTone = "notice" | "danger";

/** Something that happened around the answer, named: a retry, a provider's error, an extension's failure. */
export type NoticeRow = { kind: "notice"; name: string; tone: NoticeTone; text: string };

export type Row =
  | { kind: "user"; text: string }
  /** One assistant message, as it streams: what the model thought, then what it said. */
  | { kind: "assistant"; text: string; thinking: string; done: boolean; stopReason?: string }
  | {
      kind: "tool";
      toolCallId: string;
      name: string;
      args: unknown;
      done: boolean;
      isError?: boolean;
      durationMs?: number;
      /** The result's text, once the call ended. */
      result?: string;
    }
  | NoticeRow
  /** Something that failed to load when the session opened: informational, so it is shown muted, never as an alarm. */
  | { kind: "diagnostic"; text: string };

type AssistantRow = Extract<Row, { kind: "assistant" }>;

/** Fold one session event into the transcript rows. Pure, so it can be tested without a screen. */
export function reduceRows(rows: Row[], event: SessionEvent): Row[] {
  const last = rows[rows.length - 1];
  const open = last?.kind === "assistant" && !last.done ? last : undefined;
  switch (event.type) {
    case "text_delta":
      return open
        ? withLast(rows, { ...open, text: open.text + event.delta })
        : [...rows, { kind: "assistant", text: event.delta, thinking: "", done: false }];
    case "thinking_delta":
      return open
        ? withLast(rows, { ...open, thinking: open.thinking + event.delta })
        : [...rows, { kind: "assistant", text: "", thinking: event.delta, done: false }];
    case "message_end": {
      if (event.role !== "assistant") return rows;
      const closed = open
        ? withLast(rows, { ...open, done: true, ...(event.stopReason ? { stopReason: event.stopReason } : {}) })
        : rows;
      // Pi ends an aborted message with an error message too ("Request was
      // aborted"). A stop is the person's own act, not a provider's failure,
      // and what it leaves in the transcript is CV1.DS2's.
      if (!event.errorMessage || event.stopReason === "aborted") return closed;
      return [...closed, providerErrorNotice(event.errorMessage)];
    }
    case "tool_start":
      return [...rows, { kind: "tool", toolCallId: event.toolCallId, name: event.toolName, args: event.args, done: false }];
    case "tool_end":
      return rows.map((row) =>
        row.kind === "tool" && row.toolCallId === event.toolCallId
          ? {
              ...row,
              done: true,
              isError: event.isError,
              ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
              result: event.resultText,
            }
          : row,
      );
    case "retry":
      return [...rows, retryNotice(event)];
    default:
      return rows;
  }
}

/** A provider asked for a retry: which attempt of how many, its message, and the wait. */
export function retryNotice(retry: { attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }): NoticeRow {
  return {
    kind: "notice",
    name: `Retry ${retry.attempt} of ${retry.maxAttempts}`,
    tone: "notice",
    text: `${retry.errorMessage} · retrying in ${wholeSeconds(retry.delayMs)}`,
  };
}

/** The provider failed the message: an alarm, after whatever the answer had streamed. */
export function providerErrorNotice(message: string): NoticeRow {
  return { kind: "notice", name: "Provider error", tone: "danger", text: message };
}

/** An extension failed inside Pi; the turn goes on. */
/** The connection to the host ended while this conversation was answering: the answer stops where it was. */
export function connectionLostNotice(): NoticeRow {
  return { kind: "notice", name: "Connection lost", tone: "notice", text: "The connection to the host was lost while Pi was answering." };
}

export function extensionNotice(failure: { extension: string; event: string; message: string }): NoticeRow {
  return { kind: "notice", name: "Extension failed", tone: "notice", text: `${failure.extension} on ${failure.event}: ${failure.message}` };
}

/** The wait as Pi's retry indicator counts it: whole seconds, rounded up (Math.ceil(delayMs / 1000)). */
function wholeSeconds(ms: number): string {
  return `${Math.ceil(ms / 1000)}s`;
}

function withLast(rows: Row[], row: AssistantRow): Row[] {
  return [...rows.slice(0, -1), row];
}
