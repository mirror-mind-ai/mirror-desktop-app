// A tool call's words, as Pi writes them.
//
// Carried from Pi's own generic tool rendering, the form a tool without a
// renderer of its own takes in Pi's terminal: formatToolCallWithArgs and
// formatToolDuration in @earendil-works/pi-coding-agent's
// core/tools/render-utils.js, and the ten-line result preview of
// modes/interactive/components/tool-execution.js (FALLBACK_PREVIEW_LINES).
// The constants are Pi's; a change to them here is a departure from Pi, made
// by a decision (D15).

/** Pi's COLLAPSED_ARGS_CHARS: the folded arguments' budget, ellipsis included. */
const FOLDED_ARGUMENTS_CHARS = 100;

/** Pi's FALLBACK_PREVIEW_LINES: how much of a result a folded call shows. */
const FOLDED_RESULT_LINES = 10;

/** The arguments folded onto the call's line: `key=value` pairs, each value as JSON, cut at 100 characters. */
export function toolPreview(args: unknown): string {
  const pairs = entriesOf(args)
    .map(([key, value]) => `${key}=${JSON.stringify(value) ?? String(value)}`)
    .join(" ");
  return pairs.length > FOLDED_ARGUMENTS_CHARS ? `${pairs.slice(0, FOLDED_ARGUMENTS_CHARS - 3)}...` : pairs;
}

/** Every argument in full: a string as it is, anything else as JSON indented by two. */
export function toolArguments(args: unknown): { key: string; value: string }[] {
  return entriesOf(args).map(([key, value]) => ({
    key,
    value: (typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value))).replace(/\r/g, ""),
  }));
}

/** How long the call took: `4.2s` under a minute, then `1m 30s`, then `2h 3m 4s`. */
export function toolDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${remainder}s`;
}

/**
 * The result as a folded call shows it: its first ten lines, and how many
 * more there are. Pi counts the empty line after a final newline; a command's
 * output nearly always ends with one, so here it ends the last line instead.
 */
export function resultPreview(result: string): { shown: string; more: number } {
  const text = result.replace(/\n+$/, "");
  if (text === "") return { shown: "", more: 0 };
  const lines = text.split("\n");
  return { shown: lines.slice(0, FOLDED_RESULT_LINES).join("\n"), more: Math.max(lines.length - FOLDED_RESULT_LINES, 0) };
}

/** An object's own entries; any other value is one entry named `args`; nothing is no entries. */
function entriesOf(args: unknown): [string, unknown][] {
  if (args === null || args === undefined) return [];
  if (typeof args === "object" && !Array.isArray(args)) return Object.entries(args);
  return [["args", args]];
}
