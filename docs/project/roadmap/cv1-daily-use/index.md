[< Roadmap](../index.md)

# CV1 — Daily Use

**Status:** 🟡 Planned
**Goal:** A person opens a Journey and lives in the conversation — a real shell and transcript, the Journey's sessions, live control of a turn, an app that quits and restarts cleanly — and prefers it to terminal Pi for Journey work.

---

## What This Is

CV0 proved every integration with a throwaway console. CV1 replaces that
console with the product's spine and puts the app in daily use by its first
user, because that is where real feedback comes from. It deliberately stops
before onboarding (CV2) and distribution (CV3): the person using it already
has Mirror and Pi configured, and runs a locally built bundle.

The one product decision it rests on is [D7](../../decisions.md#d7--conversations-are-pi-sessions-many-per-journey):
a conversation is a Pi session, a Journey has many, and the desktop shows
them.

## Delivery Stories

| Code | Delivery Story | Outcome | Status |
|------|----------------|---------|--------|
| [CV1.DS1](cv1-ds1-the-conversation-shell/index.md) | The Conversation Shell | The screens a person lives in: Journeys in a sidebar, a transcript that renders what Pi produces, a composer that feels right — built on stores, tokens and a fake host that makes the UI testable | 🟡 Planned |
| [CV1.DS2](cv1-ds2-sessions-and-live-control/index.md) | Sessions and Live Control | A Journey's sessions listed, resumed and started; a running turn steered, followed up and stopped; the model chosen; the app quitting and restarting without losing anything | 🟡 Planned |

## Done Condition

The first user works a Journey in the desktop for a week without reaching
for terminal Pi for the same work, and the defects that week surfaces are
captured as Refinement, not as missing stories.
