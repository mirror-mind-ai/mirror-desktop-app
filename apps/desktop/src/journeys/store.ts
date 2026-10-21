// The Journeys, as the host listed them from Mirror.
//
// Only what the host said: the sidebar derives its tree from it (tree.ts),
// and which Journey is current belongs to the conversations, whose screen
// it is.

import type { Journey } from "@mirror-desktop/protocol";
import { create } from "zustand";

import { failureOf, type HostConnection } from "../host/client.ts";
import { registerStore } from "../stores/registry.ts";

export type JourneysState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly journeys: readonly Journey[] }
  /** `code` is the host's (`mirror_not_configured`, …), so the sidebar can say what it means. */
  | { readonly status: "failed"; readonly code: string; readonly message: string };

const initialState: JourneysState = { status: "loading" };

/**
 * Counts loads, so only the newest one writes: a Try again while an older
 * request is still out, or a reset between tests, makes the older answer
 * stale. Bumped by the reset too.
 */
let generation = 0;

export const useJourneys = create<JourneysState>()(() => initialState);
registerStore("journeys", useJourneys, initialState, () => {
  generation += 1;
});

/** Ask the host for the Journeys. A list already on screen stays there until the answer replaces it. */
export async function loadJourneys(client: HostConnection): Promise<void> {
  const mine = ++generation;
  if (useJourneys.getState().status !== "loaded") useJourneys.setState({ status: "loading" }, true);
  let next: JourneysState;
  try {
    const result = await client.request({ type: "journeys.list" });
    next =
      result.type === "journeys.list"
        ? { status: "loaded", journeys: result.journeys }
        : { status: "failed", code: "internal_failure", message: "The host answered journeys.list with something else." };
  } catch (error) {
    next = { status: "failed", ...failureOf(error) };
  }
  if (mine === generation) useJourneys.setState(next, true);
}
