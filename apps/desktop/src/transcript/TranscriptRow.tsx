import type { Row } from "../conversations/transcript.ts";
import { Pulse } from "../shell/Pulse.tsx";
import { Markdown } from "./Markdown.tsx";
import { Notice } from "./Notice.tsx";
import { Thinking } from "./Thinking.tsx";
import { ToolRow } from "./ToolRow.tsx";

/**
 * One transcript row, as Pi draws it, on Mirror's tokens: the person's own
 * words on Pi's user-message ground, as typed; the answer with its thinking
 * and its Markdown in Pi's roles, the pulse beneath it while it streams; a
 * tool call on Pi's ground; a notice named; a diagnostic muted.
 */
export function TranscriptRow({ row }: { row: Row }) {
  switch (row.kind) {
    case "user":
      return <p className="rounded-control bg-user-message px-3 py-2 text-body whitespace-pre-wrap">{row.text}</p>;
    case "assistant":
      return (
        <div className="flex min-w-0 flex-col gap-3 text-body">
          {row.thinking ? <Thinking text={row.thinking} answered={row.text !== ""} done={row.done} /> : null}
          {row.text ? <Markdown text={row.text} /> : null}
          {!row.done ? (
            <span className="flex h-6 items-center">
              <Pulse />
            </span>
          ) : null}
        </div>
      );
    case "tool":
      return <ToolRow call={row} />;
    case "notice":
      return <Notice notice={row} />;
    case "diagnostic":
      return <p className="text-meta text-muted">{row.text}</p>;
  }
}
