import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import { sessionFolderOf } from "./sessionIndex.ts";
import { projectTranscript, readSessionTranscript } from "./transcript.ts";

let next = 0;
/** An entry of a session file, with only the fields the projection reads; the cast is the test's boundary with Pi's types. */
function entry(fields: Record<string, unknown>): SessionEntry {
  next += 1;
  return { id: `e${next}`, parentId: null, timestamp: "2026-10-01T09:00:00.000Z", ...fields } as unknown as SessionEntry;
}
const message = (message: Record<string, unknown>) => entry({ type: "message", message: { timestamp: 1, ...message } });
const user = (content: unknown) => message({ role: "user", content });
const assistant = (content: unknown[], fields: Record<string, unknown> = {}) =>
  message({ role: "assistant", content, stopReason: "stop", api: "x", provider: "x", model: "x", usage: {}, ...fields });
const toolResult = (toolCallId: string, text: string, fields: Record<string, unknown> = {}) =>
  message({ role: "toolResult", toolCallId, toolName: "bash", content: [{ type: "text", text }], isError: false, ...fields });

describe("a session file, as the transcript draws it", () => {
  it("draws a turn: the person's message, the answer with its thinking, each tool call with its result", () => {
    const projected = projectTranscript([
      entry({ type: "model_change", provider: "anthropic", modelId: "claude-test" }),
      message({ role: "system", content: "The system prompt" }),
      user([{ type: "text", text: "Plant the tomatoes" }]),
      assistant(
        [
          { type: "thinking", thinking: "Where are the beds?" },
          { type: "text", text: "Looking at the beds." },
          { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls beds" } },
          { type: "toolCall", id: "c2", name: "read", arguments: { path: "beds/notes.md" } },
        ],
        { stopReason: "toolUse" },
      ),
      toolResult("c1", "north\nsouth", { durationMs: 12 }),
      toolResult("c2", "No such file", { isError: true }),
      assistant([{ type: "text", text: "Planted in the north bed." }]),
    ]);

    expect(projected).toEqual({
      earlier: 0,
      entries: [
        { kind: "user", text: "Plant the tomatoes" },
        { kind: "assistant", text: "Looking at the beds.", thinking: "Where are the beds?", stopReason: "toolUse" },
        { kind: "tool", toolCallId: "c1", name: "bash", args: { command: "ls beds" }, result: "north\nsouth", isError: false, durationMs: 12 },
        { kind: "tool", toolCallId: "c2", name: "read", args: { path: "beds/notes.md" }, result: "No such file", isError: true },
        { kind: "assistant", text: "Planted in the north bed.", thinking: "", stopReason: "stop" },
      ],
    });
  });

  it("keeps a tool call whose result never came, and a provider's failure with its words", () => {
    const projected = projectTranscript([
      user("Plant"),
      assistant([{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "sleep 99" } }], { stopReason: "aborted", errorMessage: "Request was aborted" }),
      assistant([], { stopReason: "error", errorMessage: "Overloaded" }),
    ]);

    expect(projected.entries).toEqual([
      { kind: "user", text: "Plant" },
      { kind: "assistant", text: "", thinking: "", stopReason: "aborted", errorMessage: "Request was aborted" },
      { kind: "tool", toolCallId: "c1", name: "bash", args: { command: "sleep 99" } },
      { kind: "assistant", text: "", thinking: "", stopReason: "error", errorMessage: "Overloaded" },
    ]);
  });

  it("draws what the person ran with `!` as a bash call, a shown extension message as a notice, and nothing of what is hidden", () => {
    const projected = projectTranscript([
      message({ role: "bashExecution", command: "git status", output: "clean", exitCode: 0, cancelled: false, truncated: false }),
      message({ role: "bashExecution", command: "false", output: "", exitCode: 1, cancelled: false, truncated: false }),
      entry({ type: "custom_message", customType: "mirror-context", content: "Hidden context", display: false }),
      entry({ type: "custom_message", customType: "garden-note", content: [{ type: "text", text: "Watered." }], display: true }),
      entry({ type: "compaction", summary: "Earlier, the beds were dug.", firstKeptEntryId: "x", tokensBefore: 1 }),
      entry({ type: "context_edit", targetId: "x", replacement: null }),
      entry({ type: "session_info", name: "Tomatoes" }),
      user([{ type: "image", data: "", mimeType: "image/png" }]),
    ]);

    expect(projected.entries).toEqual([
      { kind: "tool", toolCallId: expect.any(String), name: "bash", args: { command: "git status" }, result: "clean", isError: false },
      { kind: "tool", toolCallId: expect.any(String), name: "bash", args: { command: "false" }, result: "", isError: true },
      { kind: "notice", name: "garden-note", text: "Watered." },
    ]);
  });

  it("draws only the end of a long session, counting the messages left out, and never parts a call from its result", () => {
    const branch: SessionEntry[] = [];
    for (let turn = 1; turn <= 30; turn++) {
      branch.push(user(`Question ${turn}`));
      branch.push(assistant([{ type: "toolCall", id: `c${turn}`, name: "bash", arguments: { command: `step ${turn}` } }], { stopReason: "toolUse" }));
      branch.push(toolResult(`c${turn}`, `result ${turn}`));
      branch.push(assistant([{ type: "text", text: `Answer ${turn}` }]));
    }

    // 30 turns of three rows each: the question, the call with its result (its step has no text, so no row), the answer.
    const projected = projectTranscript(branch, 11);

    expect(projected.entries).toHaveLength(11);
    expect(projected.entries[0]).toEqual({ kind: "tool", toolCallId: "c27", name: "bash", args: { command: "step 27" }, result: "result 27", isError: false });
    expect(projected.entries.at(-1)).toEqual({ kind: "assistant", text: "Answer 30", thinking: "", stopReason: "stop" });
    // Left out: a question and an answer for each of 26 turns, then the question of turn 27.
    expect(projected.earlier).toBe(26 * 2 + 1);
  });

  it("cuts any text past the cap, saying where and how much is left in the file", () => {
    const projected = projectTranscript(
      [
        user("a".repeat(30)),
        assistant([{ type: "toolCall", id: "c1", name: "write", arguments: { path: "notes.md", content: "b".repeat(30) } }], { stopReason: "toolUse" }),
        toolResult("c1", "c".repeat(15)),
      ],
      200,
      20,
    );

    const cut = (character: string, more: number) => `${character.repeat(20)}\n… cut here: ${more} more characters are in the session file.`;
    expect(projected.entries).toEqual([
      { kind: "user", text: cut("a", 10) },
      { kind: "tool", toolCallId: "c1", name: "write", args: { path: "notes.md", content: cut("b", 10) }, result: "c".repeat(15), isError: false },
    ]);
  });
});

describe("reading a session's file", () => {
  let agentDir: string | undefined;
  const cwd = "/Users/test/garden";

  afterEach(async () => {
    if (agentDir) await rm(agentDir, { recursive: true, force: true });
    agentDir = undefined;
  });

  /** A session written by Pi itself, in the Journey's folder under a scratch agent directory. */
  async function writtenByPi(): Promise<string> {
    agentDir = await mkdtemp(join(tmpdir(), "mirror-desktop-transcript-"));
    const manager = SessionManager.create(cwd, sessionFolderOf(cwd, agentDir));
    manager.appendMessage({ role: "user", content: [{ type: "text", text: "Plant the tomatoes" }], timestamp: 1 });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Planted." }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-test",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: 2,
    });
    const file = manager.getSessionFile();
    if (!file) throw new Error("Pi wrote no session file.");
    return file;
  }

  it("reads back what Pi wrote, and writes nothing to the file", async () => {
    const file = await writtenByPi();
    const before = await readFile(file, "utf8");
    const modified = (await stat(file)).mtimeMs;

    expect(await readSessionTranscript(cwd, file, agentDir)).toEqual({
      earlier: 0,
      entries: [
        { kind: "user", text: "Plant the tomatoes" },
        { kind: "assistant", text: "Planted.", thinking: "", stopReason: "stop" },
      ],
    });
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await stat(file)).mtimeMs).toBe(modified);
  });

  it("refuses a file that is not one of the Journey's sessions before reading it", async () => {
    const file = await writtenByPi();

    await expect(readSessionTranscript("/Users/test/beds", file, agentDir)).rejects.toThrow("That file is not one of the Journey's sessions.");
  });
});
