import type { Row } from "../conversations/transcript.ts";

/**
 * One transcript row, drawn as the spike console drew it, moved unchanged
 * except for the diagnostic rows a session's opening can add. How each kind
 * of row is drawn is CV1.DS1.US2's.
 */
export function TranscriptRow({ row }: { row: Row }) {
  switch (row.kind) {
    case "user":
      return <p className="ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap">{row.text}</p>;
    case "assistant":
      return (
        <div className="max-w-[90%] text-sm whitespace-pre-wrap">
          {row.text}
          {!row.done ? <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" /> : null}
          {row.errorMessage ? <p className="mt-1 text-xs text-red-400">{row.errorMessage}</p> : null}
        </div>
      );
    case "tool":
      return (
        <p className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {row.done ? (row.isError ? "✗" : "✓") : "…"} {row.name} {row.summary}
          {row.durationMs !== undefined ? ` · ${row.durationMs} ms` : ""}
        </p>
      );
    case "notice":
      return <p className="text-xs text-amber-400">{row.text}</p>;
    case "diagnostic":
      return <p className="text-xs text-muted-foreground">{row.text}</p>;
  }
}
