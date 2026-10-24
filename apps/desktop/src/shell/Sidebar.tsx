import { Info, KeyRound } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";

import { isWorking, selectJourney, useConversations } from "../conversations/store.ts";
import { useHost } from "../host/store.ts";
import { useJourneys } from "../journeys/store.ts";
import { type JourneyNode, journeyTree } from "../journeys/tree.ts";
import { AppearanceControl } from "./AppearanceControl.tsx";
import { Pulse } from "./Pulse.tsx";
import { RefreshJourneys } from "./RefreshJourneys.tsx";

/**
 * The Journeys sidebar: the active Journeys nested as Mirror nests them, the
 * current one marked and a working one saying so; below them, what the person
 * acts on (signing in, the appearance) and the host's versions, behind About.
 *
 * A nested list with aria-level, not an ARIA tree: a tree promises arrow-key
 * navigation, which this story does not build.
 */
export function Sidebar({ onSignIn }: { onSignIn: () => void }) {
  const hostStatus = useHost((state) => state.status);
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-hairline bg-sidebar">
      {/* Clear of the traffic lights the overlay title bar draws here; the window drags by it. */}
      <div className="h-12 shrink-0" data-tauri-drag-region />
      <nav aria-label="Journeys" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {/* Without the host there is nothing to pick: the conversation area says why. */}
        {hostStatus === "failed" ? null : <JourneysList />}
      </nav>
      {hostStatus === "ready" ? <SidebarFooter onSignIn={onSignIn} /> : null}
    </aside>
  );
}

function JourneysList() {
  const journeys = useJourneys();
  const tree = useMemo(() => (journeys.status === "loaded" ? journeyTree(journeys.journeys) : []), [journeys]);
  switch (journeys.status) {
    case "loading":
      return <p className="px-2 py-1 text-ui text-muted">Loading Journeys…</p>;
    case "failed":
      return <JourneysFailed code={journeys.code} message={journeys.message} />;
    case "loaded":
      if (tree.length === 0) return <NoActiveJourneys hidden={journeys.journeys.length} />;
      return (
        <ul className="flex flex-col gap-0.5">
          {tree.map((node) => (
            <JourneyItem key={node.journey.id} node={node} />
          ))}
        </ul>
      );
  }
}

function JourneyItem({ node }: { node: JourneyNode }) {
  const { journey, level, children } = node;
  // One subscription per row, to its own slice: a background stream re-renders this row only.
  const isCurrent = useConversations((state) => state.current === journey.id);
  const working = useConversations((state) => isWorking(state.entries[journey.id]));
  const id = useId();
  const noPathId = `${id}-no-path`;
  const workingId = `${id}-working`;
  const described = [journey.projectPath ? null : noPathId, working ? workingId : null].filter(Boolean).join(" ");

  return (
    <li aria-level={level}>
      <button
        type="button"
        aria-label={journey.name}
        aria-current={isCurrent ? "true" : undefined}
        aria-busy={working ? "true" : undefined}
        aria-describedby={described || undefined}
        onClick={() => selectJourney(journey.id)}
        className={`flex w-full flex-col rounded-control py-1.5 pr-2 text-left text-ui outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus ${
          isCurrent ? "bg-selection font-bold" : ""
        }`}
        style={{ paddingLeft: `${0.5 + (level - 1) * 0.875}rem` }}
      >
        <span className="flex w-full items-center gap-2">
          {/* The leading slot is always there, so a row never moves when its Journey starts or stops working. */}
          <span className="flex w-2 shrink-0 justify-center">{working ? <Pulse /> : null}</span>
          <span className="min-w-0 flex-1 truncate">{journey.name}</span>
        </span>
        {journey.projectPath ? null : (
          <span id={noPathId} className="pl-4 text-meta font-normal text-muted">
            No project path yet
          </span>
        )}
        {working ? (
          <span id={workingId} className="sr-only">
            Working
          </span>
        ) : null}
      </button>
      {children.length > 0 ? (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {children.map((child) => (
            <JourneyItem key={child.journey.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** What each failure means to the person, by the host's error code, and what to do about it. */
const FAILURES: Readonly<Record<string, { heading: string; next: ReactNode }>> = {
  mirror_not_configured: {
    heading: "Mirror isn't set up on this Mac yet",
    next: (
      <>
        Set it up in a terminal with <code className="font-mono">mirror init</code>, then try again.
      </>
    ),
  },
};

const UNREADABLE = { heading: "Mirror's Journeys could not be read", next: "Try again in a moment." };

function JourneysFailed({ code, message }: { code: string; message: string }) {
  const { heading, next } = FAILURES[code] ?? UNREADABLE;
  return (
    <div className="flex flex-col gap-2 px-2 py-1">
      <h2 className="text-ui font-bold">{heading}</h2>
      <p className="text-ui text-muted">{next}</p>
      <p className="font-mono text-meta break-words text-muted">{message}</p>
      <RefreshJourneys label="Try again" />
    </div>
  );
}

function NoActiveJourneys({ hidden }: { hidden: number }) {
  return (
    <div className="flex flex-col gap-2 px-2 py-1 text-ui">
      <p className="font-bold">No active Journeys</p>
      <p className="text-muted">Create a Journey in Mirror, or reactivate a paused one, then refresh.</p>
      {hidden > 0 ? (
        <p className="text-muted">
          {hidden === 1 ? "1 inactive Journey is not shown." : `${hidden} inactive Journeys are not shown.`}
        </p>
      ) : null}
      <RefreshJourneys label="Refresh" />
    </div>
  );
}

function SidebarFooter({ onSignIn }: { onSignIn: () => void }) {
  const identity = useHost((state) => state.identity);
  const [about, setAbout] = useState(false);
  return (
    <footer className="flex flex-col gap-2 border-t border-hairline px-3 py-2 text-ui text-muted">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSignIn} className="flex items-center gap-1.5 hover:text-ink">
          <KeyRound className="size-3.5" aria-hidden="true" /> Sign in
        </button>
        <span className="flex-1" />
        <AppearanceControl />
        <button
          type="button"
          aria-expanded={about}
          onClick={() => setAbout((open) => !open)}
          className="flex items-center gap-1.5 hover:text-ink"
        >
          <Info className="size-3.5" aria-hidden="true" /> About
        </button>
      </div>
      {about && identity ? (
        <p className="font-mono text-meta">
          Node {identity.node} · Pi {identity.pi} · Mirror {identity.mirror}
        </p>
      ) : null}
    </footer>
  );
}
