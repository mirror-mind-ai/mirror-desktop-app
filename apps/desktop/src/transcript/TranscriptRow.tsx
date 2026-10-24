import type { Row } from "../conversations/transcript.ts";
import { Pulse } from "../shell/Pulse.tsx";
import { toolPreview } from "./format.ts";
import { Markdown } from "./Markdown.tsx";

/**
 * One transcript row, as Pi draws it, on Mirror's tokens: the person's own
 * words on Pi's user-message ground, as typed; the answer as Markdown in Pi's
 * roles, with the pulse beneath it while it streams.
 */
export function TranscriptRow({ row }: { row: Row }) {
  switch (row.kind) {
    case "user":
      return <p className="rounded-control bg-user-message px-3 py-2 text-body whitespace-pre-wrap">{row.text}</p>;
    case "assistant":
      return (
        <div className="flex min-w-0 flex-col gap-3 text-body">
          {row.text ? <Markdown text={row.text} /> : null}
          {!row.done ? (
            <span className="flex h-6 items-center">
              <Pulse />
            </span>
          ) : null}
        </div>
      );
    case "tool":
      return (
        <p className="rounded-control border border-hairline px-3 py-1.5 font-mono text-ui text-muted">
          {row.done ? (row.isError ? "✗" : "✓") : "…"} {row.name} {toolPreview(row.args)}
          {row.durationMs !== undefined ? ` · ${row.durationMs} ms` : ""}
        </p>
      );
    case "notice":
      return (
        <p className={row.tone === "danger" ? "text-ui text-danger" : "text-ui text-notice"}>
          {row.name}: {row.text}
        </p>
      );
    case "diagnostic":
      return <p className="text-meta text-muted">{row.text}</p>;
  }
}
