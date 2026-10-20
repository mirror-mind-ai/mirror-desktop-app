# Spike 4 — Journey binding

**Date:** 2026-10-20
**Question:** when the desktop opens a session for a Journey, can the Mirror
conversation carry that Journey from the first message, can the agent know
the Journey's context, and can every `mirror …` the agent runs bind to this
session and no other — with several sessions open at once?

**Answer: yes**, through the front door, with two core limitations found
and named.

## How Mirror binds a session

Mirror's unit of binding is the **runtime session**, keyed by the Pi session
file. Its logger extension logs every turn against that key; `mirror mirror
load --journey …` and `mirror build load …` bind the session's conversation
to a Journey (creating or switching it) and activate a mode. A command
learns which session it serves from `--session-id`, else `MIRROR_SESSION_ID`,
else **a guess** — the most recently updated active session — which is the
mechanism that once moved other Journeys' cursors in the predecessor.

## What was built

- `packages/host/src/mirror.ts`: the host's seam to the core — Mirror's
  configuration loaded as the front door loads it (`~/.config/mirror/env`,
  a checkout's `.env`), the database path resolved as the front door
  resolves it, Journeys listed through the core's read model, and the one
  write: `mirror mirror load --journey <slug> --session-id <file>` run
  through the bundled bin at open.
- `session.open { journey }`: the session runs in the Journey's project
  path; after `session_start` (which resets Mirror's *global* orientation)
  the host binds the session to the Journey; the context the front door
  prints rides into the system prompt as a context file on every run
  (inline extension, `before_agent_start`).
- **`MIRROR_SESSION_ID` for everything the agent runs**: the session's bash
  tool is the built-in one plus a spawn hook that sets the variable to the
  session file. A `mirror …` the model runs in this session binds here, by
  name — no guessing, with any number of sessions open.
- Protocol 0.4.0: `journeys.list`, Journey-bound `session.open` with
  `journey` and `mirrorConversationId` in the result; errors
  `mirror_not_configured`, `journey_not_found`, `journey_has_no_project_path`.
- The spike console opens Journeys from a picker instead of a directory.

## Verified

- A session opened for `mirror-desktop`, asked without tools which Journey,
  status and mode it is in, answered from context: *mirror-desktop, active,
  stage Starting, Mirror Mode*. Its first and second messages landed in a
  conversation already bound to `mirror-desktop`.
- `echo $MIRROR_SESSION_ID` inside the session's bash tool printed the
  session file; `mirror mode status` there reported the session's Journey,
  through the bundled `mirror` shim.
- Two sessions opened concurrently for `mirror-desktop` and `kia-desktop`
  each got their own conversation, each bound to its own Journey, each
  logged.

## Findings

1. **Mirror's logger extension registers once per process.** A guard on
   `globalThis` — meant to stop a terminal session that discovers the file
   twice from double-logging — made every session after the first in the
   host silent. The host now clears the guard before each session loads
   its extensions and serializes opening; within one load the guard works
   as designed. The proper fix is a per-session guard in the core.
2. **Operating-mode activation is global even when a session is named.**
   `mirror mirror load` binds the *conversation* per session but calls
   `activateOperatingMode` without the session id, so with two sessions
   open `mirror mode status` reports the last activation in both. This is
   the predecessor's parked CR094, now located precisely: the orchestration
   has a session-scoped activation available and does not use it.
3. **The bound conversation is labeled `claude_code`.** The conversation is
   created before the first `log-user`, when no runtime-session row names
   an interface, and the core defaults to `claude_code`; the row is later
   updated to `pi` but the conversation keeps the default. The desktop
   needs a way to declare its interface at binding time.
4. **Binding costs ~1.4 s** (`mirror mirror load` with its memory search),
   paid once per session open, on top of the ~2.5 s session open.
5. **A session for a directory, not a Journey, still works** — and logs a
   Journey-less conversation, as a terminal session does.

## Core-owned prerequisites added

Recorded in `docs/project/history/predecessor.md`: export the read models
the host deep-imports (database path resolution, Journey DTOs, runtime
session read); per-session logger guard; session-scoped mode activation
when a session is named; an interface name at binding time.
