[< Refinement Workbench](../index.md)

# RS002 — Host Runtime

## Framing

The host is one long-lived Node process (D2) that starts children of its own:
the Mirror front door, to bind a session to its Journey (D5), and, through the
shims on its PATH, everything the agent runs that calls `node` or `mirror`
(D4, `packages/host/src/runtimeBin.ts`). Whatever it took from the machine
when it started can change while it runs, in development above all, where it
runs on the machine's own `node`. This story is the home for those gaps, found
one at a time.

## Outcome

When the runtime under a running host changes, the host keeps working, or
names what changed and what to do. Each gap closes as one bounded Change
Request, with the test that pins it.

## Boundaries

- The bundle's embedded runtime, its staging and its signing are D4's and
  CV3 Trusted Distribution's.
- Quitting and restarting the app cleanly is CV1.DS2.TS1, Lifecycle hygiene.
- Behavior owned by the Mirror core (its logger, its front door) is changed
  in the Mirror repository, as a Core-owned prerequisite, not here.
- The canonical [Workbench index](../index.md) owns backlog status.

## Change Requests

- [CR002](cr002-after-a-node-upgrade-the-running-host-spawns-a-node-that-no-longer-exists.md) —
  After a Node upgrade, the running host spawns a Node that no longer exists,
  and binds no session.
