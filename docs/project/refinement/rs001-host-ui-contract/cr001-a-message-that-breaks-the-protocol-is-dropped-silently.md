[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR001 — A message that breaks the protocol is dropped silently, and the request behind it never settles

## Problem

The header of `HostClient` promises that "a host and a UI that disagree fail
here, by name". They do not:

- **A host message that fails `HostMessage` is dropped without a word**
  (`if (!parsed.success) return;`). A frame that is not JSON at all throws
  inside the socket's message listener, where nothing catches it.
- **A request the host cannot read is answered with `id: "?"`.** The host
  replies `malformed_request` with that id because it could not read the
  request's own. The client looks up its pending request by id, finds none,
  and the promise for that request never settles.

The client never checks its own requests against `ClientRequest`. The
TypeScript types guard them instead, and those cannot express the schema's
refinements: a non-empty prompt, or a `session.open` that names a Journey or a
directory. So a UI request that breaks the protocol hangs with no error, and a
host reply that breaks it disappears. The person sees a screen that waits
forever, and nothing names why.

## Expected Behavior

A disagreement between host and UI is named, and it ends the wait:

- A host message that fails `HostMessage`, or a frame that is not JSON, is
  reported by name, saying what failed, instead of dropped.
- A request the host refused as malformed fails on the UI side with
  `malformed_request` instead of waiting.
- No request waits forever for a reply the host will not send.

How this is done is for the plan. Candidates include checking requests before
they leave, correlating the host's `id: "?"` reply, a bound on each request,
or failing every pending request when the protocol is violated.

## Impact

The briefing makes errors part of the surface, and this path hides one. The
defect is latent today: the console sends only well-formed requests, and the
host and UI ship together. The first drift will show up as a hang with no
message, the hardest kind of failure to diagnose. A drift could be a schema
change on one side, an update that lands half way, or a new request with a
refinement the types cannot express.

## Plan Or Decision

Captured, unassigned, on 2026-10-21, at the Navigator's direction. It was
found while planning CV1.DS1.TS1, and that plan's review confirmed it (QA4).
TS1 does not change it: its harness reports these cases in tests, but the real
client still drops messages and hangs. Current Focus is unchanged.

## Evidence

- `apps/desktop/src/host/client.ts`:
  - line 6: the promise in the header;
  - lines 62–63: the silent drop;
  - line 66: the lookup by id.
- `packages/host/src/server.ts`, lines 176–179: the `id: "?"` reply to a
  request that does not parse.
- The
  [TS1 plan review](../../roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/plan-review.md),
  QA4: a mistyped fake-host world hangs on "Loading Journeys from Mirror…"
  because of the same drop.

## Outcome

Open.
