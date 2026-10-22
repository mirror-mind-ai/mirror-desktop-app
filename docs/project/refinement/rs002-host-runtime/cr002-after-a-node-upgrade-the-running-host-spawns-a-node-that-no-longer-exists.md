[< RS002](index.md) · [Canonical status](../index.md#change-requests)

# CR002 — After a Node upgrade, the running host spawns a Node that no longer exists, and binds no session

## Problem

In development the host runs on the machine's `node`, and it keeps the path
of the binary it started on (`process.execPath`) for three things:

- binding a session to its Journey, which runs the Mirror front door with
  that binary;
- the `node` the agent finds on its PATH, a symlink to that binary;
- the `mirror` the agent finds, a shim that executes that symlink.

Homebrew deletes the old binary when it upgrades Node. A host started before
the upgrade keeps running from a file that is gone, and all three fail: the
next session opened is not bound to its Journey (`spawn … ENOENT`), and a
`mirror` the agent runs cannot execute. The person sees only the raw error,
as a diagnostic line at the top of the conversation.

## Expected Behavior

A host that outlives its Node binary keeps working, or says what happened and
what to do:

- binding a session, and the agent's `node` and `mirror`, do not depend on a
  file that can disappear while the host runs; or
- the host notices the binary is gone and names it, as "Node was replaced
  while Mirror Desktop was running: restart the app", instead of a raw
  ENOENT.

How this is done is for the plan. Candidates include resolving `node` by name
when a child is started in development, linking the shims to a path that
survives an upgrade, and a named host error the conversation can show.

## Impact

Development only: the bundle runs its embedded `mirror-node`, which Homebrew
does not touch. In development the failure is silent and partial. The session
runs, and Mirror's logger still records the conversation under the right
Journey, because it starts `node` by name and finds the new one. But the
session carries none of the Journey's Mirror context, and the agent's own
`mirror` commands fail. Restarting the app clears it. The Navigator's runs of
the app are development runs today.

## Plan Or Decision

Captured, unassigned, on 2026-10-22, at the Navigator's direction. It was
found during CV1.DS1.US1's Navigator validation. US1 did not cause it: the
bind predates the story, and US1's shell showed the failure in place, as
designed. Current Focus is unchanged.

## Evidence

- The validation run on 2026-10-22: Automation's transcript opened with
  `mirror: could not bind the session to Journey automation: spawn
  /opt/homebrew/Cellar/node/25.9.0_2/bin/node ENOENT`. Afterwards
  `/opt/homebrew/Cellar/node/` held only `26.12.1`. Mirror recorded the
  conversation as `5566fc37 [automation]`. Recorded in the
  [US1 test guide](../../roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us1-shell-and-journeys-sidebar/test-guide.md#validation-evidence).
- `packages/host/src/mirror.ts`, line 132: the bind runs `process.execPath`.
- `packages/host/src/runtimeBin.ts`: lines 35–37, the `node` symlink to
  `process.execPath`; line 41, the `mirror` shim that executes it.
- `apps/desktop/src-tauri/src/host.rs`, line 75: in development the shell
  starts the host with the `node` on PATH.
- Mirror's logger (`mirror-mind/.pi/extensions/mirror-logger.ts`, line 252)
  starts `node` by name.
- Reproduced on 2026-10-22 with a symlink to the deleted binary first on
  PATH: running the old path fails with ENOENT; starting `node` by name skips
  the dangling link and runs v26.12.1; a shim that executes the link exits
  126, "cannot execute: No such file or directory".

## Outcome

Open.
