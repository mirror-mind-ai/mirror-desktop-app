[< CV1 Daily Use](../index.md)

# CV1.DS1 — The Conversation Shell

**Status:** 🟡 In progress
**Type:** Delivery Story

---

## Outcome

The spike console is gone. In its place, the screens a person lives in:
Journeys in a sidebar, a conversation whose transcript renders everything Pi
produces — prose, code, tables, tool calls, thinking, retries, errors — and
a composer that behaves the way hands expect. Underneath, the structure the
rest of the product grows on: Zustand stores, Mirror's own design tokens,
and a fake host so the UI is proven without a model.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV1.DS1.TS1 | Fake host and UI test harness | Technical Story | A host double speaking the protocol from fixtures, driven by Vitest with happy-dom; a UI test can open a Journey, send a prompt and assert the rendered stream with no Pi, no model, no network | ✅ Done — 2026-10-21 |
| CV1.DS1.US1 | Shell and Journeys sidebar | User Story | The app opens on a sidebar of active Journeys grouped by hierarchy and a conversation area; selecting a Journey shows it, and the first send opens a session in its project path; switching keeps each conversation and its draft; a running Journey is marked; every empty and failure state names its next step; stores replace the console's component state | ✅ Done — 2026-10-22 |
| CV1.DS1.TS2 | Mirror's tokens and theme | Technical Story | The layout, typography and dark/light tokens are the product's, not a placeholder's: Pi's look in Monaco, both themes carried from Pi's own palettes (D15), type roles, state and motion tokens, a theme preference that follows the system until chosen and survives a relaunch, and a launch with no flash | 🟡 Planned |
| CV1.DS1.US2 | Transcript rendering | User Story | Assistant prose renders as sanitized Markdown in Pi's colors, with code blocks (highlighted, copyable) and tables; tool calls are compact collapsible rows with arguments and result; thinking is muted and collapsible; retries and provider errors are named notices; the view follows the stream and offers a way back to the latest | 🟡 Planned |
| CV1.DS1.US3 | Composer | User Story | Enter sends, Shift+Enter breaks a line, Escape stops; the composer states plainly when it cannot send and why (no model, host gone, turn running); drafts already survive switching Journeys (US1); attachments by drag and drop are out of scope here | 🟡 Planned |

## Done Condition

A person opens the app, picks a Journey from the sidebar, holds a multi-turn
conversation with tool use and reads it comfortably; every rendering path
above has a UI test against the fake host; the spike console files are
deleted.
