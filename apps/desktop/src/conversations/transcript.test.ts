import { describe, expect, it } from "vitest";

import { reduceRows } from "./transcript.ts";

describe("reduceRows", () => {
  it("streams text deltas into one open assistant row and closes it at message_end", () => {
    let rows = reduceRows([], { type: "text_delta", delta: "po" });
    rows = reduceRows(rows, { type: "text_delta", delta: "ng" });
    expect(rows).toEqual([{ kind: "assistant", text: "pong", done: false }]);
    rows = reduceRows(rows, { type: "message_end", role: "assistant", text: "pong", stopReason: "stop" });
    expect(rows).toEqual([{ kind: "assistant", text: "pong", done: true, stopReason: "stop" }]);
  });

  it("starts a new assistant row after a tool call", () => {
    let rows = reduceRows([], { type: "text_delta", delta: "Let me check." });
    rows = reduceRows(rows, { type: "message_end", role: "assistant", text: "Let me check.", stopReason: "toolUse" });
    rows = reduceRows(rows, { type: "tool_start", toolCallId: "c1", toolName: "bash", args: { command: "ls" } });
    rows = reduceRows(rows, { type: "tool_end", toolCallId: "c1", toolName: "bash", isError: false, durationMs: 9, resultText: "a" });
    rows = reduceRows(rows, { type: "text_delta", delta: "One file." });
    expect(rows.map((row) => row.kind)).toEqual(["assistant", "tool", "assistant"]);
    expect(rows[1]).toMatchObject({ kind: "tool", done: true, isError: false, durationMs: 9 });
  });

  it("surfaces a provider error that arrives with no streamed text", () => {
    const rows = reduceRows([], { type: "message_end", role: "assistant", text: "", stopReason: "error", errorMessage: "overloaded" });
    expect(rows).toEqual([{ kind: "notice", text: "overloaded" }]);
  });

  it("ignores events the transcript does not render", () => {
    expect(reduceRows([], { type: "agent_start" })).toEqual([]);
    expect(reduceRows([], { type: "message_end", role: "user", text: "hi" })).toEqual([]);
  });
});
