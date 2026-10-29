// A session file, as the transcript draws it.
//
// Picking a Journey or a session shows what the session holds without
// opening it (D14): the host reads the file and projects its branch, from
// the root to its leaf, onto the protocol's TranscriptEntry, the shape of a
// row once its turn has ended. It is the read-side twin of `projectEvent` in
// sessions.ts, which projects a live turn: the two agree on what a row holds,
// so a session read back looks as it did while it streamed.
//
// What is drawn: the person's messages; each answer with its thinking; each
// tool call with its result, matched by id, and a call whose result never
// came (the turn stopped first) without one; what the person ran with `!`,
// as a bash call; an extension's message when it asked to be shown. What is
// not: the system prompt Pi records, hidden extension messages (Mirror's
// context), compaction and branch summaries (the file keeps the messages they
// summarize), context edits (they change what the model sees, not what was
// said), model, thinking, label and name changes. Images are dropped, as the
// live projection drops them: a row holds text.
//
// Bounded twice, because a session can be large (the first user's largest
// is 75 MB, and one tool result in it is 1.37 MB): only the last `limit`
// entries, with the count of the messages left before them; and no text
// longer than `cap`, cut with a line that says so.
//
// The file is read by Pi's own SessionManager, which knows every version of
// its format and only reads a file that has content; the whole file is
// loaded, synchronously: 175 ms and 208 MB, released after, on the largest
// session known. A look at that session holds the host that long.

import { getAgentDir, type SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import type { TranscriptEntry } from "@mirror-desktop/protocol";

import { containedSessionFile, SessionsUnreadableError } from "./sessionIndex.ts";

/** The entries a read returns: the end of the session. */
export const TRANSCRIPT_LIMIT = 200;
/** The longest text an entry carries, in characters. */
export const TEXT_CAP = 64 * 1024;

export interface Transcript {
  entries: TranscriptEntry[];
  /** The user and assistant messages before the first entry. */
  earlier: number;
}

type ToolEntry = Extract<TranscriptEntry, { kind: "tool" }>;

/**
 * One of the project path's sessions, read from its file and projected.
 * Refuses a file that is not one of them before reading anything.
 */
export async function readSessionTranscript(cwd: string, file: string, agentDir: string = getAgentDir()): Promise<Transcript> {
  const contained = await containedSessionFile(cwd, file, agentDir);
  let branch: SessionEntry[];
  try {
    branch = SessionManager.open(contained, undefined, cwd).getBranch();
  } catch (cause) {
    // Pi's words carry the path: these do not.
    throw new SessionsUnreadableError("This session could not be read: its file is not a Pi session Pi can load.", { cause });
  }
  return projectTranscript(branch);
}

/** The branch's entries, oldest first, as rows: the last `limit` of them, every text within `cap`. */
export function projectTranscript(branch: readonly SessionEntry[], limit = TRANSCRIPT_LIMIT, cap = TEXT_CAP): Transcript {
  const entries: TranscriptEntry[] = [];
  const calls = new Map<string, ToolEntry>();

  for (const entry of branch) {
    if (entry.type === "custom_message") {
      if (entry.display) entries.push({ kind: "notice", name: entry.customType, text: textOf(entry.content) });
      continue;
    }
    if (entry.type !== "message") continue;
    // Pi's message union, read through the fields the projection needs: its
    // custom roles (bashExecution) are declared by merging, so they are read
    // as what the file holds rather than narrowed by role.
    const message = entry.message as unknown as RecordedMessage;
    switch (message.role) {
      case "user": {
        const text = textOf(message.content);
        if (text) entries.push({ kind: "user", text });
        break;
      }
      case "assistant": {
        const blocks = Array.isArray(message.content) ? message.content : [];
        const text = joined(blocks, "text");
        const thinking = joined(blocks, "thinking");
        if (text || thinking || message.errorMessage) {
          entries.push({
            kind: "assistant",
            text,
            thinking,
            ...(typeof message.stopReason === "string" ? { stopReason: message.stopReason } : {}),
            ...(typeof message.errorMessage === "string" && message.errorMessage ? { errorMessage: message.errorMessage } : {}),
          });
        }
        for (const block of blocks) {
          if (!isBlock(block, "toolCall") || typeof block.id !== "string") continue;
          const call: ToolEntry = { kind: "tool", toolCallId: block.id, name: String(block.name ?? "tool"), args: block.arguments ?? {} };
          calls.set(block.id, call);
          entries.push(call);
        }
        break;
      }
      case "toolResult": {
        const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
        let call = calls.get(toolCallId);
        if (!call) {
          // A result whose call is not on the branch: drawn on its own rather than lost.
          call = { kind: "tool", toolCallId, name: String(message.toolName ?? "tool"), args: {} };
          entries.push(call);
        }
        call.result = textOf(message.content);
        call.isError = message.isError === true;
        if (typeof message.durationMs === "number") call.durationMs = message.durationMs;
        break;
      }
      case "bashExecution":
        entries.push({
          kind: "tool",
          toolCallId: entry.id,
          name: "bash",
          args: { command: String(message.command ?? "") },
          result: typeof message.output === "string" ? message.output : "",
          isError: message.cancelled === true || (typeof message.exitCode === "number" && message.exitCode !== 0),
        });
        break;
      default:
        break;
    }
  }

  const kept = entries.length > limit ? entries.slice(entries.length - limit) : entries;
  const left = entries.slice(0, entries.length - kept.length);
  return {
    entries: kept.map((kept) => capped(kept, cap)),
    earlier: left.filter((entry) => entry.kind === "user" || entry.kind === "assistant").length,
  };
}

/**
 * The text of a message's content: a string, or its text blocks joined by a
 * line break. Shared with the live projection, so a message reads the same
 * streamed and read back.
 */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return joined(content, "text");
}

interface RecordedMessage {
  role?: unknown;
  content?: unknown;
  stopReason?: unknown;
  errorMessage?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  isError?: unknown;
  durationMs?: unknown;
  command?: unknown;
  output?: unknown;
  exitCode?: unknown;
  cancelled?: unknown;
}

type Block = { type?: unknown; text?: unknown; thinking?: unknown; id?: unknown; name?: unknown; arguments?: unknown };

function isBlock(block: unknown, type: string): block is Block {
  return typeof block === "object" && block !== null && (block as Block).type === type;
}

/** The blocks of one type, their text (`text` or `thinking`) joined by a line break. */
function joined(blocks: readonly unknown[], type: "text" | "thinking"): string {
  return blocks
    .filter((block) => isBlock(block, type))
    .map((block) => (block as Block)[type])
    .filter((text): text is string => typeof text === "string" && text !== "")
    .join("\n");
}

function capped(entry: TranscriptEntry, cap: number): TranscriptEntry {
  switch (entry.kind) {
    case "user":
    case "notice":
      return { ...entry, text: cut(entry.text, cap) };
    case "assistant":
      return { ...entry, text: cut(entry.text, cap), thinking: cut(entry.thinking, cap) };
    case "tool":
      return {
        ...entry,
        args: cutStrings(entry.args, cap),
        ...(entry.result !== undefined ? { result: cut(entry.result, cap) } : {}),
      };
  }
}

function cut(text: string, cap: number): string {
  if (text.length <= cap) return text;
  // Never split a character written as two UTF-16 units.
  const end = /[\uD800-\uDBFF]/.test(text.charAt(cap - 1)) ? cap - 1 : cap;
  const more = text.length - end;
  return `${text.slice(0, end)}\n… cut here: ${more.toLocaleString("en-US")} more characters are in the session file.`;
}

/** A tool's arguments with every string in them cut at the cap: a `write` call carries a whole file. */
function cutStrings(value: unknown, cap: number): unknown {
  if (typeof value === "string") return cut(value, cap);
  if (Array.isArray(value)) return value.map((item) => cutStrings(item, cap));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cutStrings(item, cap)]));
  }
  return value;
}
