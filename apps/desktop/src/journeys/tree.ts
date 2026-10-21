// The sidebar's tree: the active Journeys, nested the way Mirror nests them.
//
// The rule is the Mirror core's own (`groupJourneysByParent` and the sort in
// `listJourneyOptions`, mirror-mind ts/src/journey/journeyOptions.ts), applied
// to the Journeys the sidebar shows, the active ones:
//
// - a Journey whose parent is not shown stands at the root, so an active child
//   of a paused parent is not hidden with it;
// - siblings are ordered by name, lower-cased and compared by code unit, ties
//   kept in the order the host listed them: the comparison the core makes, so
//   the sidebar reads in the order `mirror journeys` prints;
// - a parent link that loops (a Journey that is its own ancestor, which only
//   malformed data can say) is ignored for the Journeys in the loop, which
//   stand at the root, so every Journey is shown exactly once and the walk
//   ends. The core starts the loop's first Journey as a root and nests the rest
//   under it instead; corrupt data has no right answer, and this one reads
//   most plainly.
//
// It is computed here and not in the host because the protocol already carries
// `Journey.parent`, and ordering through the core in the host would need a
// second reach past the core's public surface for one sort rule.

import type { Journey } from "@mirror-desktop/protocol";

export interface JourneyNode {
  readonly journey: Journey;
  /** 1 at the root, counted as aria-level counts. */
  readonly level: number;
  readonly children: readonly JourneyNode[];
}

export function journeyTree(journeys: readonly Journey[]): JourneyNode[] {
  const shown = new Map(journeys.filter((journey) => journey.status === "active").map((journey) => [journey.id, journey]));
  const parentOf = (journey: Journey): string | undefined =>
    journey.parent !== undefined && shown.has(journey.parent) ? journey.parent : undefined;

  /** Whether walking up from `journey` comes back to it. Bounded: a walk longer than the set has looped. */
  const inLoop = (journey: Journey): boolean => {
    let ancestor = parentOf(journey);
    for (let steps = 0; ancestor !== undefined && steps < shown.size; steps++) {
      if (ancestor === journey.id) return true;
      const next = shown.get(ancestor);
      ancestor = next ? parentOf(next) : undefined;
    }
    return false;
  };

  const roots: Journey[] = [];
  const childrenOf = new Map<string, Journey[]>();
  for (const journey of shown.values()) {
    const parent = inLoop(journey) ? undefined : parentOf(journey);
    if (parent === undefined) roots.push(journey);
    else childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), journey]);
  }

  // With the looping links ignored no parent chain repeats, so this recursion ends.
  const node = (journey: Journey, level: number): JourneyNode => ({
    journey,
    level,
    children: byName(childrenOf.get(journey.id) ?? []).map((child) => node(child, level + 1)),
  });
  return byName(roots).map((root) => node(root, 1));
}

/** Sorted as the core sorts siblings; Array.prototype.sort is stable, so ties keep the listing's order. */
function byName(journeys: readonly Journey[]): Journey[] {
  return [...journeys].sort((a, b) => {
    const first = a.name.toLowerCase();
    const second = b.name.toLowerCase();
    return first < second ? -1 : first > second ? 1 : 0;
  });
}
