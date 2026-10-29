// A Journey's sessions, read the way a look should be: cheaply, and without
// writing anything.
//
// Terminal Pi keeps a project's sessions in one folder under its agent
// directory, one JSONL file each (`sessions/--<project path>--/`), and a
// Journey's sessions are the files in its project path's folder: the same
// list `pi -r` shows there, whichever Journey or terminal wrote them (D7).
//
// Pi's own `SessionManager.list()` reads every file whole to search their
// text. On a Journey with 760 sessions and 1.7 GB that took 2.9 s and 366 MB,
// at every pick. A list needs less: the header (the session's id and start),
// the file's last change, and a title. They are at the head of the file, so
// the index reads each file only until its first user message, at most
// HEAD_LIMIT bytes. On the first user's 778 sessions that message always
// ended within 61 KB, after the system prompt Pi records ahead of it.
//
// Two departures from Pi's list, both for the head: a session is ordered by
// its file's last change, where Pi reads the whole file for its last message;
// the file changes when a message is appended, so the order is the same but
// for a file touched by something else. And a name given to a session after
// its first message is missed: a name is rare (one in 778), and finding a late
// one means reading the whole file.
//
// The same module says whether a file the UI names is one of the Journey's
// sessions: the UI may only make the host read or resume those.

import { open, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionSummary } from "@mirror-desktop/protocol";

/** How far into a file the index reads for its first user message. */
const HEAD_LIMIT = 256 * 1024;
const CHUNK = 16 * 1024;
/** Files read at once while listing a folder. */
const CONCURRENCY = 16;
const TITLE_LIMIT = 120;
const UNTITLED = "Untitled session";

/** The Journey's sessions could not be listed. The message names what failed, never a path. */
export class SessionsUnreadableError extends Error {
  override readonly name = "SessionsUnreadableError";
}

/** A file the host was asked to read or resume is not one it may: the message says why, never where. */
export class SessionFileRefusedError extends Error {
  override readonly name = "SessionFileRefusedError";
}

/**
 * The folder Pi keeps a project path's sessions in. Pi computes it in
 * `getDefaultSessionDir`, which also creates the folder (a write a look must
 * not make) and is not exported; this is its encoding, and
 * sessionIndex.test.ts holds it to the folder Pi itself reports.
 */
export function sessionFolderOf(cwd: string, agentDir: string = getAgentDir()): string {
  const project = resolve(cwd).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-");
  return join(resolve(agentDir), "sessions", `--${project}--`);
}

/** The project path's sessions, newest first. A project Pi never ran in has none. */
export async function listSessions(cwd: string, agentDir: string = getAgentDir()): Promise<SessionSummary[]> {
  const folder = sessionFolderOf(cwd, agentDir);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return [];
    throw new SessionsUnreadableError(`The session folder could not be read: ${reasonOf(cause)}.`, { cause });
  }
  const files = names.filter((name) => name.endsWith(".jsonl")).map((name) => join(folder, name));
  const summaries = await mapLimited(files, CONCURRENCY, summarize);
  return summaries
    .filter((summary): summary is SessionSummary => summary !== undefined)
    .sort((a, b) => b.modified - a.modified || b.created - a.created);
}

/**
 * The file, as named, when it is one of the project path's sessions: a
 * non-empty `.jsonl` file directly in its folder, once every link on the way
 * is followed. Otherwise refused by name. Compared through `realpath` so that
 * neither `..` nor a link placed in the folder leads the host elsewhere.
 */
export async function containedSessionFile(cwd: string, file: string, agentDir: string = getAgentDir()): Promise<string> {
  const named = resolve(file);
  if (!named.endsWith(".jsonl")) throw notOneOfTheJourneys();
  let real: string;
  try {
    real = await realpath(named);
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") throw new SessionFileRefusedError("That session's file no longer exists.", { cause });
    throw new SessionFileRefusedError(`That session's file could not be read: ${reasonOf(cause)}.`, { cause });
  }
  // A Journey with no folder has no sessions: the file, which exists, is not one of them.
  const folder = await realpath(sessionFolderOf(cwd, agentDir)).catch(() => undefined);
  if (folder === undefined || dirname(real) !== folder || !real.endsWith(".jsonl")) throw notOneOfTheJourneys();
  const info = await stat(real);
  if (!info.isFile()) throw notOneOfTheJourneys();
  // Pi rewrites an empty file it is asked to open: never hand it one.
  if (info.size === 0) throw new SessionFileRefusedError("That session's file is empty.");
  return named;
}

function notOneOfTheJourneys(): SessionFileRefusedError {
  return new SessionFileRefusedError("That file is not one of the Journey's sessions.");
}

interface Head {
  id: string;
  created: number;
  title: string;
}

async function summarize(file: string): Promise<SessionSummary | undefined> {
  try {
    const info = await stat(file);
    if (!info.isFile()) return undefined;
    const head = await readHead(file);
    if (!head) return undefined;
    return { file, id: head.id, title: head.title, created: Number.isNaN(head.created) ? info.mtimeMs : head.created, modified: info.mtimeMs };
  } catch (cause) {
    // One unreadable file must not hide the others; the host's log says which.
    process.stderr.write(`mirror-host: session ${basename(file)} skipped: ${reasonOf(cause)}\n`);
    return undefined;
  }
}

/** The header and the title, read line by line from the start of the file; undefined when it is not a session. */
async function readHead(file: string): Promise<Head | undefined> {
  const handle = await open(file, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.alloc(CHUNK);
    const head = new HeadReader();
    let pending = "";
    let position = 0;
    while (position < HEAD_LIMIT) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK, position);
      const atEnd = bytesRead === 0;
      position += bytesRead;
      pending += atEnd ? decoder.end() : decoder.write(buffer.subarray(0, bytesRead));
      const lines = pending.split("\n");
      pending = atEnd ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const state = head.take(line);
        if (state === "not_a_session") return undefined;
        if (state === "complete") return head.result();
      }
      if (atEnd) break;
    }
    return head.result();
  } finally {
    await handle.close();
  }
}

/** What the lines at the head of a file say, one line at a time. */
class HeadReader {
  #header: { id: string; created: number } | undefined;
  #name: string | undefined;
  #firstMessage: string | undefined;

  take(line: string): "reading" | "complete" | "not_a_session" {
    if (!line.trim()) return "reading";
    const entry = parseLine(line);
    if (!this.#header) {
      if (!entry || entry.type !== "session" || typeof entry.id !== "string") return "not_a_session";
      this.#header = { id: entry.id, created: typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN };
      return "reading";
    }
    if (entry?.type === "session_info") this.#name = typeof entry.name === "string" ? entry.name.trim() || undefined : undefined;
    this.#firstMessage = firstUserText(entry);
    return this.#firstMessage === undefined ? "reading" : "complete";
  }

  result(): Head | undefined {
    if (!this.#header) return undefined;
    return { ...this.#header, title: titleOf(this.#name ?? this.#firstMessage) };
  }
}

type Entry = { type?: unknown; id?: unknown; timestamp?: unknown; name?: unknown; message?: { role?: unknown; content?: unknown } };

function parseLine(line: string): Entry | undefined {
  try {
    const value: unknown = JSON.parse(line);
    // A line of a file another program wrote: every field is checked where it is read.
    return typeof value === "object" && value !== null ? (value as Entry) : undefined;
  } catch {
    return undefined;
  }
}

/** A user message's text, its text blocks joined with a space as Pi's list joins them; undefined for anything else. */
function firstUserText(entry: Entry | undefined): string | undefined {
  if (entry?.type !== "message" || entry.message?.role !== "user") return undefined;
  const content = entry.message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((block): block is { type: "text"; text: string } => {
      return typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text)
    .join(" ");
}

/**
 * A title as the header can draw it: text a model or a tool may have
 * written, so no control, bidi or zero-width character survives to make it
 * read as something else; whitespace folded to one line; bounded.
 */
function titleOf(text: string | undefined): string {
  const plain = (text ?? "").replace(/[\p{Cc}\p{Cf}]/gu, (character) => (/\s/.test(character) ? " " : "")).replace(/\s+/g, " ").trim();
  if (!plain) return UNTITLED;
  return plain.length > TITLE_LIMIT ? `${plain.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : plain;
}

function errorCode(cause: unknown): string | undefined {
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
}

/** What a file system failure means, in words, without the path it carries. */
function reasonOf(cause: unknown): string {
  switch (errorCode(cause)) {
    case "EACCES":
    case "EPERM":
      return "permission denied";
    case "ENOTDIR":
      return "not a folder";
    case "EMFILE":
    case "ENFILE":
      return "too many open files";
    case undefined:
      return "an unexpected failure";
    default:
      return `the system said ${errorCode(cause)}`;
  }
}

async function mapLimited<T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await map(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
