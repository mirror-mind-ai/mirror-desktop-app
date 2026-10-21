// Turn fixtures: the session events a fake host plays after a prompt.
//
// A fixture is a JSON list of SessionEvents in `fixtures/`, checked when it is
// used, so one broken file fails the tests that play it, by name, rather than
// every test at collection. Three checks, each failing with the file, the
// event's index and the problem:
//
// - the protocol: every event is a SessionEvent, with no field the schema does
//   not describe (a parse alone would strip it, and the file would keep it);
// - the shape of a turn, as the host's projection of Pi emits it
//   (packages/host/src/sessions.ts): agent_start first, agent_settled last,
//   deltas inside an assistant message, and the assistant's message_end text
//   equal to the joined text deltas. That last rule holds for a message with
//   one text block, which every fixture so far is; the projection joins
//   several blocks with "\n", which deltas never carry;
// - the content: invented and inert. No home directory but /Users/test/, and
//   nothing shaped like a secret. Failure output prints fixture content, and it
//   reaches terminals and the model behind a coding agent, so real paths, real
//   tool output and real session text never enter a fixture.

import { SessionEvent } from "@mirror-desktop/protocol";

const SOURCES = import.meta.glob<string>("./fixtures/*.json", { eager: true, query: "?raw", import: "default" });

const FORBIDDEN_CONTENT: readonly { problem: string; pattern: RegExp }[] = [
  { problem: "a home directory other than /Users/test/", pattern: /\/(?:Users|home)\/(?!test\/)[^/\s"\\]+/ },
  { problem: "a secret-shaped string (an API key)", pattern: /\bsk-(?:ant-|or-)?[A-Za-z0-9_-]{8,}/ },
  { problem: "a secret-shaped string (a GitHub token)", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { problem: "a secret-shaped string (an AWS access key)", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { problem: "a secret-shaped string (a JWT)", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { problem: "a secret-shaped string (a private key)", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Events that never happen while a message is still open. */
const OUTSIDE_MESSAGES = new Set<SessionEvent["type"]>([
  "agent_start",
  "agent_end",
  "agent_settled",
  "message_start",
  "tool_start",
  "tool_end",
  "retry",
]);

/** Every fixture by name: `streamed-answer` for `fixtures/streamed-answer.json`. */
export function fixtureNames(): string[] {
  return Object.keys(SOURCES)
    .map((path) => path.replace(/^\.\/fixtures\//, "").replace(/\.json$/, ""))
    .sort();
}

/** The fixture `fixtures/<name>.json`, checked. */
export function loadTurn(name: string): SessionEvent[] {
  const source = SOURCES[`./fixtures/${name}.json`];
  if (source === undefined) {
    throw new Error(`There is no fixture ${name}.json. Fixtures: ${fixtureNames().join(", ") || "none"}`);
  }
  return turnFromSource(`${name}.json`, source);
}

/** A fixture file's text, read and checked. */
export function turnFromSource(file: string, source: string): SessionEvent[] {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (cause) {
    throw new Error(`${file} is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return parseTurn(file, data);
}

/** A turn's events, checked against the protocol, the shape of a turn and the content rules. */
export function parseTurn(name: string, data: unknown): SessionEvent[] {
  if (!Array.isArray(data)) throw new Error(`${name}: a turn is a JSON list of session events`);
  const events = data.map((raw: unknown, index) => parseEvent(name, index, raw));
  checkShape(name, events);
  return events;
}

function parseEvent(name: string, index: number, raw: unknown): SessionEvent {
  const type = typeof raw === "object" && raw !== null ? (raw as { type?: unknown }).type : undefined;
  const where = `${name}: event ${index}${typeof type === "string" ? ` (${type})` : ""}`;
  const parsed = SessionEvent.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    throw new Error(`${where}: ${path ? `${path}: ` : ""}${issue?.message ?? "not a session event"}`);
  }
  for (const key of Object.keys(raw as object)) {
    if (!(key in parsed.data)) throw new Error(`${where}: unknown field "${key}"`);
  }
  const text = JSON.stringify(raw);
  for (const { problem, pattern } of FORBIDDEN_CONTENT) {
    if (pattern.test(text)) throw new Error(`${where}: ${problem}`);
  }
  return parsed.data;
}

function checkShape(name: string, events: readonly SessionEvent[]): void {
  const at = (index: number) => `${name}: event ${index} (${events[index]?.type ?? "none"})`;
  if (events[0]?.type !== "agent_start") throw new Error(`${at(0)}: a turn starts with agent_start`);

  let open: { role: string; index: number; text: string } | null = null;
  events.forEach((event, index) => {
    if (open && OUTSIDE_MESSAGES.has(event.type)) {
      throw new Error(`${at(index)}: the ${open.role} message opened at event ${open.index} is still open`);
    }
    switch (event.type) {
      case "message_start":
        open = { role: event.role, index, text: "" };
        return;
      case "text_delta":
      case "thinking_delta":
        if (open?.role !== "assistant") throw new Error(`${at(index)}: a delta outside an assistant message`);
        if (event.type === "text_delta") open.text += event.delta;
        return;
      case "message_end":
        if (open?.role !== event.role) {
          throw new Error(`${at(index)}: ends a ${event.role} message that was never started`);
        }
        if (event.role === "assistant" && event.text !== open.text) {
          throw new Error(`${at(index)}: its text is not the joined text deltas`);
        }
        open = null;
        return;
      default:
        return;
    }
  });

  const last = events.length - 1;
  if (events[last]?.type !== "agent_settled") throw new Error(`${at(last)}: a turn ends with agent_settled`);
}
