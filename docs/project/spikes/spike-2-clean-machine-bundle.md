# Spike 2 — Clean-machine bundle

**Date:** 2026-10-20
**Question:** can the app ship its own Node runtime and its own copies of Pi
and the Mirror core, signed under the hardened runtime, and run a real turn
on a machine with no Node, no Pi and no Mirror on the PATH?

**Answer: yes.** `Mirror Desktop_0.0.0_aarch64.dmg`, 67 MiB (240 MiB
installed), signed with an Apple Development identity under the hardened
runtime with the `allow-jit` entitlement, launched with a scrubbed
environment (`env -i`, `PATH=/usr/bin:/bin:/usr/sbin:/sbin`): the host
boots on the embedded Node 24, opens a session with Mirror's extension and
skills, the agent runs `which node mirror` and `mirror runtime status`
through the bash tool and gets the bundle's own copies, and the conversation
lands in `memory.db` through Mirror's logger.

## What was built

- `apps/desktop/scripts/fetch-node-runtime.mjs`: downloads the official
  Node 24.19.0 archive for the target triple, verifies its SHA256 against a
  committed table, extracts only the `node` binary into
  `src-tauri/binaries/mirror-node-<triple>` (Kia Desktop's D109 recipe; the
  hashes agree with the table Kia verified against the release keys).
- `apps/desktop/scripts/stage-host.mjs`: copies the host's sources and
  installs its production dependencies fresh into
  `src-tauri/resources/host/` (`--omit=dev --ignore-scripts`), with the
  protocol package copied rather than linked.
- `src-tauri/tauri.bundle.conf.json`: an overlay for `tauri build` only,
  declaring the sidecar (`externalBin`) and the staged host (`resources`),
  so a plain `cargo check` on a fresh checkout does not fail for lack of
  them. `npm run bundle` applies it.
- `src-tauri/Entitlements.plist`: `com.apple.security.cs.allow-jit` — V8
  dies under the hardened runtime without it. Applied to every signed
  target, as the bundler has no per-target entitlements (Kia D112).
- `src-tauri/src/host.rs`: prefers the embedded runtime (sidecar beside the
  executable + staged host in the resources) and falls back to
  `node packages/host/src/main.ts` only in a checkout. Holds the host's stdin
  open for the shell's lifetime.
- `packages/host/src/runtimeBin.ts`: the host materializes a bin directory
  under the app's data root with `node` (a symlink to the binary running the
  host) and `mirror` (a shim over the bundled Mirror core's own bin), and
  prepends it to its PATH. Every child Pi spawns — the Mirror logger's
  `node bin/mirror.js`, the bash tool running a skill's `mirror …` — finds
  the bundle's runtime and the bundle's Mirror, in development too.
- `packages/host/src/typeStripping.ts`: the load hook now also covers the
  protocol package, which is a copy under `node_modules` in a bundle.

## Measurements (bundle, scrubbed environment, Node 24.19.0)

| Stage | Time |
|---|---|
| host listening | 524 ms |
| `session.open` (Mirror package loaded, `session_start` run) | 2.4 s |
| prompt → first token | ~4.7 s with two tool rounds in between |
| bash tool round-trips | 9 ms, 460 ms (`mirror runtime status`) |
| `session.close` | 2.3 s |

Sizes: `mirror-node` 115 MiB, staged host 160 MiB (of which Pi's provider
SDKs — openai 27 MiB, @anthropic-ai 14 MiB, @google 11 MiB, AWS — are the
bulk). DMG 67 MiB.

## Findings

1. **`URL.pathname` is not a path.** Inside "Mirror Desktop.app" it yields
   `Mirror%20Desktop.app`; the Mirror package silently failed to load in the
   first bundle, and the host had discarded the loader's error. Fixed with
   `fileURLToPath`; `session.open` now returns `diagnostics` naming every
   resource that failed to load, and the host logs them.
2. **A killed shell orphaned its host.** `Child::kill` on exit does not run
   when the shell dies abruptly, and the orphan kept sessions and the
   database open. The host now holds a stdin pipe from the shell and shuts
   down on its EOF.
3. **The bundle identifier `ai.mirrormind.desktop.app` ends with `.app`.**
   Tauri warns, and the reason is real: the app-data directory
   `~/Library/Application Support/ai.mirrormind.desktop.app` is shown by
   Finder as an application bundle. Worth changing before any user data
   lives under it.
4. **Project-level Pi packages apply to the host's sessions.** A `.pi/settings.json`
   in a Journey directory (the `mirror` Journey lists the global
   `mirror-mind`) loads for sessions opened there, exactly as in terminal
   Pi — a second copy of the logger extension, which its own process-wide
   guard then skips. Expected, but worth knowing when a Journey has its own
   `.pi/`.
5. **Node 24 runs everything the host needs:** `registerHooks`,
   `stripTypeScriptTypes`, `node:sqlite`, and Pi's extension loader.
6. **Size is dominated by provider SDKs and the Node binary.** Trimming
   (pruning provider SDKs the app does not route to, stripping Node's ICU
   data) is possible later; the DMG is acceptable as is.

## Not in this spike

- Notarization and a Developer ID (the identity here is Apple Development:
  valid on this Mac, not for distribution).
- Windows and Linux bundles — the fetch script already knows their triples.
- A fresh user account with no `~/.pi` or `~/.mirror-minds`: that is
  onboarding (spike 3), not runtime independence.
- Graceful host stop on quit (SIGTERM with a bounded wait) — the stdin EOF
  now triggers the same `shutdown()`, so sessions do get `session_shutdown`
  when the shell exits normally.
