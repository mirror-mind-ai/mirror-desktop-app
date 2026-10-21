[< Parent](../index.md)

# CV1.DS1.US1 — Shell and Journeys sidebar

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a person who works several Journeys,
I want the app to open on a sidebar of my active Journeys, grouped the way Mirror groups them, with the conversation of the one I pick beside it,
So that I move between Journeys the way I move between projects — looking costs nothing, sending is the act — and never wonder which Journey a conversation belongs to, where it runs, or whether it is still running.

## Outcome

The spike console is gone. The window opens on a shell: a sidebar of active
Journeys grouped by hierarchy, and a conversation area. Picking a Journey
shows it — its name and project path in the header, its conversation, its
composer — and writes nothing. The first send opens a Pi session in the
Journey's project path and binds its Mirror conversation; the header then
shows the model and thinking level. Picking another Journey and coming back
shows the first one still there, with its draft and everything its turn
streamed meanwhile, and a Journey whose turn is running is marked in the
sidebar. A Journey without a project path can be looked at and says how to
give it one; a Mirror that is not configured, a host that cannot be reached,
a session that fails to open, and a first run with no model each say what
happened and what to do next, in place, never only as a toast. Underneath,
the app's state lives in stores that US2 and US3 grow on. The look of all of
this — tokens, type, theme — is [TS2](../cv1-ds1-ts2-mirrors-tokens-and-theme/index.md)'s.

## Acceptance Behavior

```text
Given Mirror has active Journeys, some the children of others, and some inactive
When the app opens
Then the sidebar lists the active Journeys, each child nested under its parent, siblings ordered as `mirror journeys` orders them
And an active child whose parent is not shown stands at the root
And inactive Journeys do not appear

Given a Journey with a project path
When the person picks it
Then the sidebar marks it current and the area shows its name, its project path and the composer
And no session was opened

Given a picked Journey
When the person sends the first message
Then exactly one session is opened for it, in its project path, and the message is sent to it
And the header shows where the session runs, its model and its thinking level

Given two Journeys, the first with a draft typed and a turn still streaming
When the person switches to the second and back to the first
Then the second shows its own conversation and composer, nothing of the first's
And the first shows its draft and the whole of what its turn streamed meanwhile
And while the first's turn ran, its sidebar item said so
And neither Journey was opened twice

Given a Journey without a project path
When the person picks it
Then the area says it has no project path yet and names the command that sets one, and there is nothing to send with

Given no model can be used
When the app opens
Then the sidebar is there to look at, and the area carries the sign-in panel instead of a composer
And no session can be opened until a model exists

Given Mirror is not configured
When the app opens
Then the sidebar says so in the product's voice, with the host's words beneath and a way to try again

Given the host cannot be reached
When the app opens
Then the area says so, with a way to try again, and the sidebar offers nothing to pick

Given a session that fails to open
When the person sends
Then the area names the failure and the path, the draft is kept, and sending again retries
```

## Scope

- The shell: sidebar, conversation area, headers, and every empty and
  failure state with its next step.
- The Journeys sidebar: active Journeys as a nested list, selection, the
  running marker, the no-project-path case.
- Lazy open: one session per Journey, opened on the first send, kept for the
  app run; events and requests routed to the right conversation.
- Drafts kept per Journey (one US3 bullet, moved here on review).
- Zustand stores with actions, replacing the console's component state:
  host, Journeys, conversations.
- The fake host's first scripted failures: `hello`, `journeys.list` and
  `session.open`, and a held `session.open`.
- The console removed; its proof test, its mid-turn leak test and its
  transcript reducer move with their behavior into the shell.

## Out Of Scope

- Tokens, typography, theme and chrome polish (TS2).
- Transcript rendering (US2): the transcript keeps the console's plain
  rendering, moved, not redesigned.
- The rest of the composer (US3): Escape, and the composer stating why it
  cannot send.
- Sessions per Journey, resuming, steering, stop from the sidebar, model
  choice, automatic reconnection, quit and restart (CV1.DS2).
- "Settled while unseen" marker; tree keyboard navigation; a resizable or
  collapsible sidebar; journey icons; a command palette; localization.

## Validation

`npm test` green with the new UI and store tests; one run of the real app
on two Journeys the Navigator names. The route is in the
[test guide](test-guide.md); the plan in [plan.md](plan.md); the review
behind it in [plan-review.md](plan-review.md).
