# Predecessor: `mirror-mind-ai/mirror-desktop`

**Status:** lineage record
**Recorded:** 2026-10-20

## Lineage

Mirror Desktop has had two bodies.

The first, `mirror-mind-ai/mirror-desktop`, grew out of Nautilus Harness and
reached `v0.2.0-alpha.55`. It proved the product: a Tauri app where a person
operates Journey-bound Pi and Mirror conversations, with durable history,
concurrent Journeys, steering, voice composition, artifacts, curated themes,
a private macOS alpha channel and trusted self-update. It is in daily use by
its original author and remains so while this repository matures.

This repository, `mirror-mind-ai/mirror-desktop-app`, is the second body. It
keeps the product and starts the implementation over, for the reasons set out
in [the reinvention proposal](../explorations/reinvention-proposal.md):

- the first body is bound to the Python Mirror core (`uv run python -m memory …`,
  `mirrorCore >=0.31.14,<0.32.0`), which Mirror 0.35 replaced with a
  TypeScript core that retired the journey-projection contract the desktop
  consumed;
- its architecture is organized around process boundaries — one Pi RPC
  child per turn, a turn journal, a settlement frontier, an append outbox and
  generation projections — and most of its open defects are symptoms of
  those boundaries;
- its installation path presumes a maintainer's machine.

The second body embeds Pi and the Mirror core as libraries in one long-lived
Node host, so that none of those boundaries exist to be reconciled.

## What carries over, and how

Carried over means **copied with a provenance note**, never forked wholesale:

- the product name, icon and journey (`mirror-desktop`);
- the trusted self-update channel, its documentation and release provenance;
- the stable/development channel split by bundle identifier;
- bounded native capabilities: voice transcription (managed `whisper.cpp`),
  journey appearance assets, user avatar, window geometry, the artifact
  reveal boundary;
- small domain modules: composer drafts, conversation search, link
  classification;
- the curated dark and light palettes, as token sets;
- the principle that errors are part of the surface.

Not carried over: dedicated thread and generation files, the turn journal,
the settlement frontier, the Mirror append outbox, the Python provisioning
scripts, journey-projection contracts, the runtime-binding settings form,
PATH discovery, the Tactical and Strategic altitudes, the Ariad observatory.

## Identity during the transition

| | first body | second body |
|---|---|---|
| repository | `mirror-mind-ai/mirror-desktop` | `mirror-mind-ai/mirror-desktop-app` |
| bundle identifier | `ai.mirrormind.desktop` (stable), `.dev`, `.eval` | `ai.mirrormind.mirror-desktop` |
| update channel | `updates.mirrormind.sh/mirror-desktop/alpha/…` | none yet |
| dev server port | 1420 | 1421 |

The two bodies never share app data. The second takes over the stable bundle
identifier and the update channel only at a deliberate cutover, once it
covers daily use and its users run the TypeScript Mirror.

## Rename choreography (deferred)

The canonical repository name may move to the second body later. GitHub
redirects an old name only until a repository takes it, so the order matters:

1. rename `mirror-desktop` → `mirror-desktop-alpha` (redirect stays active);
2. update every clone's remote and the origin allow-list in the first body's
   `scripts/private_alpha_preflight.mjs`; verify `git fetch` and `gh release view`
   reach `mirror-desktop-alpha`;
3. only then rename `mirror-desktop-app` → `mirror-desktop`.

The update channel is unaffected by any rename: manifests and artifacts are
served from `updates.mirrormind.sh`, with no GitHub URL embedded.

## Core-owned prerequisites

Capabilities the desktop needs from the Mirror core that the core does not
expose yet. Each is implemented in the Mirror repository with its own tests
and release before the desktop consumes it.

| # | Prerequisite | Why | Status |
|---|---|---|---|
| 1 | A package entry point for `mirror-mind` (`exports` → `./ts/src/index.ts`) | Today the public API is reachable only by path (`mirror-mind/ts/src/index.ts`); the host also needs a load hook because Node will not strip types under `node_modules` | open |
| 2 | Export the read models the host deep-imports today: `resolveDbPath` (frontDoor/dbPath.ts), `listJourneyDtos` (mcp/readModels.ts), `getRuntimeSession` (mirror/runtimeSession.ts); then typed read models for what is still CLI-rendered only (journey status and stage, tasks, week, welcome card data) | The desktop renders screens from rows, not from terminal text; `packages/host/src/mirror.ts` is the one file reaching past `ts/src/index.ts` | open |
| 3 | A per-session guard in the Pi logger extension instead of the process-wide `globalThis.__mirrorLoggerRegistered` | A host opens several sessions in one process; today every session after the first is silent unless the host clears the guard (spike 4) | open |
| 4 | Session-scoped operating-mode activation in `mirror mirror load` / `build load` when a session is named | Conversation binding is per session, mode activation is global; two open sessions report the last activation (the predecessor's CR094) | open |
| 5 | An interface name at binding time (`mirror mirror load --interface …`, or a session registration that carries it) | A conversation bound before its first message is labeled `claude_code` | open |
