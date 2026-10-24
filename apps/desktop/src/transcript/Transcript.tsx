import { ArrowDown } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import type { Row } from "../conversations/transcript.ts";
import { followsAfterScroll } from "./follow.ts";
import { Following } from "./following.ts";
import { TranscriptRow } from "./TranscriptRow.tsx";

/**
 * A conversation's transcript: its rows in the reading measure, and the one
 * behavior a stream needs. While the view is at the bottom it follows the
 * latest text; once the person scrolls up to read, it holds still and offers
 * "Jump to latest", which returns to the end and follows again. The scroll is
 * instant: a smooth one would read off the bottom mid-animation and stop the
 * following it serves.
 *
 * It owns the rows and the following, nothing else; what the conversation
 * says about its session (opening, a failed open) comes in as `children`,
 * after the rows. A conversation mounts at the bottom, and a Journey's
 * conversation mounts afresh, so switching Journeys opens at the latest.
 */
export function Transcript({ rows, children }: { rows: readonly Row[]; children?: ReactNode }) {
  const log = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  /** Where the view was at the last scroll event: only a move up stops the following. */
  const lastTop = useRef(0);

  useLayoutEffect(() => {
    const view = log.current;
    if (!view || !following) return;
    view.scrollTo({ top: view.scrollHeight, behavior: "instant" });
    lastTop.current = view.scrollTop;
  }, [rows, following]);

  function scrolled(): void {
    const view = log.current;
    if (!view) return;
    const next = followsAfterScroll(following, view, lastTop.current);
    lastTop.current = view.scrollTop;
    if (next !== following) setFollowing(next);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={log} role="log" aria-label="Transcript" onScroll={scrolled} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex max-w-measure flex-col gap-5 select-text">
          <Following.Provider value={following}>
            {rows.map((row, index) => (
              <TranscriptRow key={row.kind === "tool" ? `tool:${row.toolCallId}` : `row:${index}`} row={row} />
            ))}
          </Following.Provider>
          {children}
        </div>
      </div>
      {!following ? (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-control border border-hairline bg-raised px-3 py-1.5 text-ui text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ArrowDown aria-hidden="true" className="size-3.5" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
