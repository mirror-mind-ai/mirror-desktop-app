import type { Row } from "../conversations/transcript.ts";
import { Pulse } from "./Pulse.tsx";

/**
 * One transcript row, drawn as the spike console drew it, on Mirror's tokens:
 * the person's own words on Pi's user-message ground across the measure, as
 * Pi draws them, the answer as plain text in the reading size. How each kind
 * of row is rendered (Markdown, tools, thinking) is CV1.DS1.US2's.
 */
export function TranscriptRow({ row }: { row: Row }) {
  switch (row.kind) {
    case "user":
      return <p className="rounded-control bg-user-message px-3 py-2 text-body whitespace-pre-wrap">{row.text}</p>;
    case "assistant":
      return (
        <div className="text-body whitespace-pre-wrap">
          {row.text}
          {!row.done ? (
            <span className="ml-2 inline-flex align-middle">
              <Pulse />
            </span>
          ) : null}
          {row.errorMessage ? <p className="mt-1 text-ui text-danger">{row.errorMessage}</p> : null}
        </div>
      );
    case "tool":
      return (
        <p className="rounded-control border border-hairline px-3 py-1.5 font-mono text-ui text-muted">
          {row.done ? (row.isError ? "✗" : "✓") : "…"} {row.name} {row.summary}
          {row.durationMs !== undefined ? ` · ${row.durationMs} ms` : ""}
        </p>
      );
    case "notice":
      return <p className="text-ui text-notice">{row.text}</p>;
    case "diagnostic":
      return <p className="text-meta text-muted">{row.text}</p>;
  }
}
