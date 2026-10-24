import { describe, expect, it } from "vitest";

import { extensionNotice, providerErrorNotice, reduceRows, retryNotice, type Row } from "./transcript.ts";

const play = (...events: Parameters<typeof reduceRows>[1][]): Row[] => events.reduce(reduceRows, [] as Row[]);

describe("reduceRows", () => {
  it("streams text deltas into one open assistant row and closes it at message_end", () => {
    let rows = reduceRows([], { type: "text_delta", delta: "po" });
    rows = reduceRows(rows, { type: "text_delta", delta: "ng" });
    expect(rows).toEqual([{ kind: "assistant", text: "pong", thinking: "", done: false }]);
    rows = reduceRows(rows, { type: "message_end", role: "assistant", text: "pong", stopReason: "stop" });
    expect(rows).toEqual([{ kind: "assistant", text: "pong", thinking: "", done: true, stopReason: "stop" }]);
  });

  it("keeps the thinking on the assistant row, before the text that follows it", () => {
    const rows = play(
      { type: "thinking_delta", delta: "Weighing " },
      { type: "thinking_delta", delta: "it." },
      { type: "text_delta", delta: "Done." },
      { type: "message_end", role: "assistant", text: "Done.", stopReason: "stop" },
    );
    expect(rows).toEqual([{ kind: "assistant", text: "Done.", thinking: "Weighing it.", done: true, stopReason: "stop" }]);
  });

  it("keeps a tool call's arguments and, once it ends, its result", () => {
    const rows = play(
      { type: "text_delta", delta: "Let me check." },
      { type: "message_end", role: "assistant", text: "Let me check.", stopReason: "toolUse" },
      { type: "tool_start", toolCallId: "c1", toolName: "bash", args: { command: "ls" } },
    );
    expect(rows[1]).toEqual({ kind: "tool", toolCallId: "c1", name: "bash", args: { command: "ls" }, done: false });

    const ended = play(
      { type: "tool_start", toolCallId: "c1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_start", toolCallId: "c2", toolName: "bash", args: { command: "pwd" } },
      { type: "tool_end", toolCallId: "c1", toolName: "bash", isError: false, durationMs: 9, resultText: "a\nb" },
      { type: "text_delta", delta: "Two files." },
    );
    expect(ended.map((row) => row.kind)).toEqual(["tool", "tool", "assistant"]);
    expect(ended[0]).toEqual({ kind: "tool", toolCallId: "c1", name: "bash", args: { command: "ls" }, done: true, isError: false, durationMs: 9, result: "a\nb" });
    expect(ended[1]).toMatchObject({ toolCallId: "c2", done: false });
  });

  it("names a provider's error after the partial answer, which it closes", () => {
    const rows = play(
      { type: "text_delta", delta: "Half an ans" },
      { type: "message_end", role: "assistant", text: "Half an ans", stopReason: "error", errorMessage: "overloaded" },
    );
    expect(rows).toEqual([
      { kind: "assistant", text: "Half an ans", thinking: "", done: true, stopReason: "error" },
      { kind: "notice", name: "Provider error", tone: "danger", text: "overloaded" },
    ]);
  });

  it("names a provider's error that arrives with no streamed text", () => {
    const rows = reduceRows([], { type: "message_end", role: "assistant", text: "", stopReason: "error", errorMessage: "overloaded" });
    expect(rows).toEqual([{ kind: "notice", name: "Provider error", tone: "danger", text: "overloaded" }]);
  });

  // Pi ends an aborted message with "Request was aborted". A stop is the
  // person's own act, not a provider's failure; what it leaves in the
  // transcript is CV1.DS2's.
  it("does not call a stopped message a provider's error", () => {
    const rows = play(
      { type: "text_delta", delta: "Half" },
      { type: "message_end", role: "assistant", text: "Half", stopReason: "aborted", errorMessage: "Request was aborted" },
    );
    expect(rows).toEqual([{ kind: "assistant", text: "Half", thinking: "", done: true, stopReason: "aborted" }]);
  });

  it("names a retry with its attempt, the provider's message and its delay", () => {
    const rows = reduceRows([], { type: "retry", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "overloaded" });
    expect(rows).toEqual([{ kind: "notice", name: "Retry 1 of 3", tone: "notice", text: "overloaded · retrying in 2s" }]);
  });

  it("ignores events the transcript does not render", () => {
    expect(reduceRows([], { type: "agent_start" })).toEqual([]);
    expect(reduceRows([], { type: "message_end", role: "user", text: "hi" })).toEqual([]);
  });
});

describe("the notices", () => {
  // Pi's retry indicator counts whole seconds up: Math.ceil(delayMs / 1000).
  it("round a retry's delay up to whole seconds, as Pi's retry indicator does", () => {
    const delay = (delayMs: number) => retryNotice({ attempt: 2, maxAttempts: 5, delayMs, errorMessage: "busy" }).text;
    expect(delay(2000)).toBe("busy · retrying in 2s");
    expect(delay(2001)).toBe("busy · retrying in 3s");
    expect(delay(400)).toBe("busy · retrying in 1s");
  });

  it("name a provider's error in danger and an extension's failure in the notice tone", () => {
    expect(providerErrorNotice("quota exceeded")).toEqual({ kind: "notice", name: "Provider error", tone: "danger", text: "quota exceeded" });
    expect(extensionNotice({ extension: "mirror", event: "agent_end", message: "the database is locked" })).toEqual({
      kind: "notice",
      name: "Extension failed",
      tone: "notice",
      text: "mirror on agent_end: the database is locked",
    });
  });
});
