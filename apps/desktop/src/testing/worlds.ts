// Invented Journeys, models and turns for the shell's UI tests.
//
// Inert by the harness's rules: no real paths (only /Users/test/), no real
// session text. One small garden of Journeys covers every shape the sidebar
// has to show: a parent with a child, a paused parent with an active child,
// and a parent with no project path over a child that has one.

import type { AvailableModel, Journey, SessionEvent } from "@mirror-desktop/protocol";

export const model: AvailableModel = { provider: "anthropic", id: "claude-test", name: "Claude Test", reasoning: true };

export const garden: Journey = {
  id: "garden",
  name: "Garden",
  status: "active",
  description: "Tending things",
  projectPath: "/Users/test/garden",
};

/** Garden's child. */
export const beds: Journey = {
  id: "beds",
  name: "Beds",
  status: "active",
  description: "Raised beds",
  projectPath: "/Users/test/beds",
  parent: "garden",
};

/** Paused, so the sidebar does not show it. */
export const attic: Journey = {
  id: "attic",
  name: "Attic",
  status: "paused",
  description: "Kept for later",
  projectPath: "/Users/test/attic",
};

/** Active under the paused Attic, so it stands at the root. */
export const loft: Journey = {
  id: "loft",
  name: "Loft",
  status: "active",
  description: "Up the ladder",
  projectPath: "/Users/test/loft",
  parent: "attic",
};

/** No project path yet. */
export const orchard: Journey = { id: "orchard", name: "Orchard", status: "active", description: "Not planted yet" };

/** Orchard's child, which has a project path of its own. */
export const pears: Journey = {
  id: "pears",
  name: "Pears",
  status: "active",
  description: "One tree",
  projectPath: "/Users/test/pears",
  parent: "orchard",
};

/** A whole turn answering `prompt` with `text` at once: for a test about where a turn goes, not how it streams. */
export function briefAnswer(prompt: string, text: string): SessionEvent[] {
  return [
    { type: "agent_start" },
    { type: "message_start", role: "user" },
    { type: "message_end", role: "user", text: prompt },
    { type: "message_start", role: "assistant" },
    { type: "text_delta", delta: text },
    { type: "message_end", role: "assistant", text, stopReason: "stop" },
    { type: "agent_end" },
    { type: "agent_settled", aborted: false },
  ];
}
