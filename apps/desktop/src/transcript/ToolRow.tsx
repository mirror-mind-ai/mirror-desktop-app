import { useId, useState } from "react";

import type { Row } from "../conversations/transcript.ts";
import { Pulse } from "../shell/Pulse.tsx";
import { resultPreview, toolArguments, toolDuration, toolPreview } from "./format.ts";

type ToolCall = Extract<Row, { kind: "tool" }>;
type ToolState = "running" | "succeeded" | "failed";

/** Pi's tool grounds, whole class names so the stylesheet keeps them. */
const GROUND: Readonly<Record<ToolState, string>> = {
  running: "bg-tool-pending",
  succeeded: "bg-tool-success",
  failed: "bg-tool-error",
};

/**
 * A tool call, as Pi draws one a tool renderer of its own does not replace:
 * on Pi's ground for its state, one line (a mark, the name in bold, the
 * arguments folded as Pi folds them, the duration as Pi writes it), then up
 * to ten lines of the result, muted. Opened, every argument in full and the
 * whole result; the transcript scrolls, the row never does.
 */
export function ToolRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const state: ToolState = !call.done ? "running" : call.isError ? "failed" : "succeeded";
  const preview = toolPreview(call.args);

  return (
    <div role="group" aria-label={`${call.name} tool call`} className={`rounded-control px-3 py-2 font-mono text-ui ${GROUND[state]}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Mark state={state} />
        <span className="shrink-0 font-bold text-ink">{call.name}</span>
        {preview ? <span className="min-w-0 truncate text-muted">{preview}</span> : null}
        {call.durationMs !== undefined ? <span className="ml-auto shrink-0 text-muted">{toolDuration(call.durationMs)}</span> : null}
      </button>
      <div id={detailsId}>{open ? <Opened call={call} /> : <Folded result={call.result} />}</div>
    </div>
  );
}

function Mark({ state }: { state: ToolState }) {
  if (state === "running") {
    return (
      <span role="img" aria-label="running" className="flex size-3.5 shrink-0 items-center justify-center">
        <Pulse />
      </span>
    );
  }
  return (
    <span role="img" aria-label={state} className={`w-3.5 shrink-0 text-center ${state === "failed" ? "text-danger" : "text-success"}`}>
      {state === "failed" ? "✗" : "✓"}
    </span>
  );
}

function Folded({ result }: { result: string | undefined }) {
  const { shown, more } = resultPreview(result ?? "");
  if (!shown) return null;
  return (
    <div className="mt-1">
      <pre className="whitespace-pre-wrap wrap-anywhere text-muted">{shown}</pre>
      {more > 0 ? <p className="text-muted">{`… ${more} more ${more === 1 ? "line" : "lines"}`}</p> : null}
    </div>
  );
}

function Opened({ call }: { call: ToolCall }) {
  const args = toolArguments(call.args);
  const result = (call.result ?? "").replace(/\n+$/, "");
  return (
    <div className="mt-2 flex flex-col gap-2 text-muted">
      {args.length > 0 ? (
        <dl className="flex flex-col gap-1">
          {args.map(({ key, value }) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd className="pl-4 whitespace-pre-wrap wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result ? <pre className="whitespace-pre-wrap wrap-anywhere">{result}</pre> : null}
    </div>
  );
}
