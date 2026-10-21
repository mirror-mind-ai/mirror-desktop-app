// The transcript: one conversation's session events folded into the rows a
// screen renders. Moved from the spike console unchanged (CV1.DS1.US1); how
// each row is drawn is US2's.

import type { SessionEvent } from "@mirror-desktop/protocol";

export type Row =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; done: boolean; stopReason?: string; errorMessage?: string }
  | { kind: "tool"; toolCallId: string; name: string; summary: string; done: boolean; isError?: boolean; durationMs?: number }
  | { kind: "notice"; text: string }
  /** Something that failed to load when the session opened: informational, so it is shown muted, never as an alarm. */
  | { kind: "diagnostic"; text: string };

/** Fold one session event into the transcript rows. Pure, so it can be tested without a screen. */
export function reduceRows(rows: Row[], event: SessionEvent): Row[] {
  const last = rows[rows.length - 1];
  switch (event.type) {
    case "text_delta": {
      if (last?.kind === "assistant" && !last.done) {
        return [...rows.slice(0, -1), { ...last, text: last.text + event.delta }];
      }
      return [...rows, { kind: "assistant", text: event.delta, done: false }];
    }
    case "message_end": {
      if (event.role !== "assistant") return rows;
      if (last?.kind === "assistant" && !last.done) {
        return [
          ...rows.slice(0, -1),
          {
            ...last,
            done: true,
            ...(event.stopReason ? { stopReason: event.stopReason } : {}),
            ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
          },
        ];
      }
      if (event.errorMessage) return [...rows, { kind: "notice", text: event.errorMessage }];
      return rows;
    }
    case "tool_start":
      return [
        ...rows,
        {
          kind: "tool",
          toolCallId: event.toolCallId,
          name: event.toolName,
          summary: JSON.stringify(event.args).slice(0, 160),
          done: false,
        },
      ];
    case "tool_end":
      return rows.map((row) =>
        row.kind === "tool" && row.toolCallId === event.toolCallId
          ? {
              ...row,
              done: true,
              isError: event.isError,
              ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
            }
          : row,
      );
    case "retry":
      return [...rows, { kind: "notice", text: `retrying (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}` }];
    default:
      return rows;
  }
}
