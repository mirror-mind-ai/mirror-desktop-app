[< RS002](index.md) · [Canonical status](../index.md#change-requests)

# CR003 — Mirror loads twice in the host, and logs every prompt twice

## Problem

The host loads two copies of the Mirror package into every session: the
one it bundles (`additionalExtensionPaths` in
`packages/host/src/sessions.ts`) and the one the person's own Pi settings
list (`packages` in `~/.pi/agent/settings.json`, here
`/opt/homebrew/lib/node_modules/mirror-mind`). They are two files, so Pi
1.4.0, which dedupes extensions by real path, keeps both.

Mirror 0.38.0's logger expects a second copy and dedupes its handlers by
event object: the first copy to see an event handles it, the other
returns. That holds only where Pi hands every handler the same object. For
`before_agent_start` it does not: Pi builds a fresh event for each handler
(`emitBeforeAgentStart` in Pi's extension runner). So both copies log each
prompt, and both deliver Mirror's context to the model. The reply, logged
at `agent_settled`, whose event is shared, is logged once.

The host still clears `__mirrorLoggerRegistered` before each session loads
its extensions (`MIRROR_LOGGER_GUARD` in `sessions.ts`), a workaround for a
guard Mirror 0.38.0 no longer has.

## Expected Behavior

A prompt sent from the desktop is logged once in Mirror, and Mirror's
context reaches the model once per turn, as in terminal Pi.

How this is done is for the plan. Candidates: the host loads one Mirror
(its own, leaving the person's out of a desktop session, or the person's
when present, which raises a version question); or Mirror's logger
dedupes `before_agent_start` by something stable, a Core-owned
prerequisite. The obsolete guard workaround goes either way.

## Impact

Every conversation the desktop logs holds each of its prompts twice, which
Mirror's memory and its extraction read as the person saying it twice.
Every turn carries Mirror's context twice, in tokens and in the time
before the first word: the 3.8 s the real turn of CV1.DS2.US2 waited for
Pi to start includes both copies' context step. Terminal Pi loads one copy
and is not affected.

## Plan Or Decision

Captured, unassigned, on 2026-11-05, by the Navigator's ruling in
CV1.DS2.US2's Debt Review. It was found by that story's real turn. US2 did
not cause it: it changed neither how the host loads Mirror nor how Mirror
logs, and the same doubled prompt is in conversations logged since
CV1.DS1.US3. Current Focus is unchanged.

## Evidence

- `mirror recall 039b206b` (US2's real turn, 2026-11-05), `83af4af9` and
  `ab43069c` (US1, 2026-10-29), `7070fc32` (US3, 2026-10-28): each prompt
  sent from the desktop appears twice as a user message, the reply once.
  In `ab43069c`, a prompt sent from terminal Pi into the same conversation
  appears once.
- US2's real turn printed two `message_end custom` events before the
  answer: Mirror's context, delivered by each copy.
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js`,
  `emitBeforeAgentStart`: `const event = { ...trigger, type:
  "before_agent_start", … }` inside the loop over handlers.
- `node_modules/mirror-mind/.pi/extensions/mirror-logger.ts`: the
  `HANDLED_KEY` comment and `once()`, deduping by event object.

## Outcome

Open.
