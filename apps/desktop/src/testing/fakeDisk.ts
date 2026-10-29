// The fake host's disk: each Journey's sessions, as Pi keeps them in a
// project's session folder and the real host lists, reads and resumes them
// (CV1.DS2.US1).
//
// A world scripts them, checked like a turn's events: by the protocol and by
// the fixture net, so no real path or secret-shaped text enters one. The disk
// then keeps them as Pi does: a session opened new is not listed until its
// first prompt is played, since Pi writes a session's file only with its
// first message, and is titled by that prompt; every prompt makes its session
// the newest; and a turn played in a session is written into it, so the
// session can be read back as the real host reads a file.
//
// The fake host owns everything else: which sessions are open, which Journey
// they belong to, and the rules of opening one (fakeHost.ts).

import { type SessionEvent, SessionSummary, TranscriptEntry } from "@mirror-desktop/protocol";

import { contentProblem } from "./turns.ts";

/** One of a Journey's sessions on disk, as the fake host lists, reads and resumes it. Invented, like a turn. */
export interface ScriptedSession {
  readonly file: string;
  readonly id: string;
  readonly title: string;
  readonly created: number;
  readonly modified: number;
  readonly entries: readonly TranscriptEntry[];
  /** The messages before the first entry, which the real host's bound leaves out. */
  readonly earlier?: number;
}

/** A session as a read finds it: what session.open resumes and session.transcript answers. */
export interface ReadSession {
  readonly file: string;
  readonly id: string;
  readonly entries: readonly TranscriptEntry[];
  readonly earlier: number;
}

/** A session on disk: scripted, or created by an open and listed once prompted. */
interface DiskSession {
  readonly file: string;
  readonly id: string;
  title: string;
  created: number;
  modified: number;
  entries: TranscriptEntry[];
  earlier: number;
  listed: boolean;
}

type Issue = { path: PropertyKey[]; message: string } | undefined;

/**
 * Refuse sessions the fake host could not serve, naming where: a Journey it
 * cannot list (none in the world, or no project path), a session or an entry
 * that breaks the protocol, content the fixture net refuses.
 */
export function checkSessions(
  scripted: Readonly<Record<string, readonly ScriptedSession[]>>,
  listable: (journey: string) => boolean,
  fail: (where: string, issue: Issue) => Error,
): void {
  for (const [journey, sessions] of Object.entries(scripted)) {
    if (!listable(journey)) {
      throw new Error(`The fake host's world: sessions names "${journey}", a Journey the world does not have or one with no project path`);
    }
    sessions.forEach((session, index) => {
      const where = `sessions.${journey}[${index}]`;
      const summary = SessionSummary.safeParse(session);
      if (!summary.success) throw fail(where, summary.error.issues[0]);
      session.entries.forEach((entry, at) => {
        const parsed = TranscriptEntry.safeParse(entry);
        if (!parsed.success) throw fail(`${where}.entries[${at}]`, parsed.error.issues[0]);
      });
      const problem = contentProblem(JSON.stringify(session));
      if (problem) throw new Error(`The fake host's world: ${where}: ${problem}`);
    });
  }
}

export class FakeDisk {
  /** Each Journey's sessions, in the order they were written here. */
  readonly #sessions = new Map<string, DiskSession[]>();

  constructor(scripted: Readonly<Record<string, readonly ScriptedSession[]>> = {}) {
    for (const [journey, sessions] of Object.entries(scripted)) {
      this.#sessions.set(
        journey,
        sessions.map((session) => ({ ...session, entries: [...session.entries], earlier: session.earlier ?? 0, listed: true })),
      );
    }
  }

  /** The Journey's listed sessions, newest first, as sessions.list answers them. */
  list(journey: string): SessionSummary[] {
    return this.#of(journey)
      .filter((session) => session.listed)
      .sort((a, b) => b.modified - a.modified)
      .map(({ file, id, title, created, modified }) => ({ file, id, title, created, modified }));
  }

  /** The Journey's listed session at `file`: what a read or a resume may name. */
  listed(journey: string, file: string): ReadSession | undefined {
    return this.#of(journey).find((session) => session.listed && session.file === file);
  }

  /** A new session's file, made by an open. Not listed until its first prompt. */
  create(journey: string, id: string, file: string): void {
    this.#of(journey).push({ file, id, title: "", created: 0, modified: 0, entries: [], earlier: 0, listed: false });
  }

  /**
   * A prompt played at `now` in the Journey's session at `file`, written as
   * Pi writes it: a new session is listed from its first prompt, titled by
   * it; the session becomes the newest; and its turn can be read back.
   */
  record(journey: string, file: string, prompt: string, events: readonly SessionEvent[], now: number): void {
    const session = this.#of(journey).find((candidate) => candidate.file === file);
    if (!session) return;
    if (!session.listed) {
      session.listed = true;
      session.title = prompt.replace(/\s+/g, " ").trim();
      session.created = now;
    }
    session.modified = now;
    session.entries.push(...entriesOf(prompt, events));
  }

  #of(journey: string): DiskSession[] {
    let sessions = this.#sessions.get(journey);
    if (!sessions) {
      sessions = [];
      this.#sessions.set(journey, sessions);
    }
    return sessions;
  }
}

/** A played turn as the real host reads it back from the file: the prompt, each answer, each tool call with its result. */
function entriesOf(prompt: string, events: readonly SessionEvent[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [{ kind: "user", text: prompt }];
  let thinking = "";
  for (const event of events) {
    switch (event.type) {
      case "thinking_delta":
        thinking += event.delta;
        break;
      case "message_end":
        if (event.role !== "assistant") break;
        if (event.text || thinking || event.errorMessage) {
          entries.push({
            kind: "assistant",
            text: event.text,
            thinking,
            ...(event.stopReason ? { stopReason: event.stopReason } : {}),
            ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
          });
        }
        thinking = "";
        break;
      case "tool_start":
        entries.push({ kind: "tool", toolCallId: event.toolCallId, name: event.toolName, args: event.args });
        break;
      case "tool_end":
        for (const entry of entries) {
          if (entry.kind !== "tool" || entry.toolCallId !== event.toolCallId) continue;
          entry.result = event.resultText;
          entry.isError = event.isError;
          if (event.durationMs !== undefined) entry.durationMs = event.durationMs;
        }
        break;
      default:
        break;
    }
  }
  return entries;
}
