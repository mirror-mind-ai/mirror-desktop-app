# Mirror Desktop — Reinvention Proposal

**Date:** 2026-10-20
**Journey:** mirror-desktop
**Status:** founding exploration of `mirror-mind-ai/mirror-desktop-app`; the ideas below are the direction, not settled scope

Sources read: Mirror Desktop (repo, docs, explorations), Kia Desktop (code, CLAUDE.md,
decisions D12/D20/D109/D112/D124), Mirror TS core (`mirror-dev`, v0.35, `ts/src/index.ts`
public API, Pi extension, MCP), Pi 1.3.0 SDK docs (`sdk.md`, `cli-integration.md`, examples).

Goals:

- as easy as possible to install and start using;
- as fast and responsive as possible;
- as easy to use as possible;
- as beautiful as possible;
- as well integrated as possible with Pi;
- as well integrated as possible with the TypeScript Mirror.

---

## 1. Diagnosis — where Mirror Desktop stands today

- **It is wired to a Mirror that no longer exists.** `main.rs` calls
  `uv run python -m memory journey export-registry`, `journey mutate`,
  `journey-projection inspect`, `recall`; two Python scripts are bundled as resources;
  `config/runtime-compatibility.json` pins `mirrorCore >=0.31.14,<0.32.0`. Mirror 0.35 is
  pure TypeScript, Node ≥ 24, and upstream explicitly retired journey projections "because
  the consumer (Mirror Desktop) pins to the last Python-bearing release". The integration
  layer is dead code against the new core.
- **Process boundaries are the source of most complexity.** One Pi RPC child per turn
  (`--mode rpc --no-extensions …`), separate children for compaction, provisioning and
  recall, and a Rust lifecycle built around those boundaries: process registry, turn
  journal, settlement frontier, Mirror append outbox, generation projections. Sizes:
  `main.rs` 14.8k lines, `App.tsx` 7.6k lines with 171 `useState` / 70 `useEffect`,
  87 Tauri commands, `app.css` 9.5k lines, ~35k lines of TS plus ~35k of tests. The open
  canvas items are symptoms of exactly that: "Finishing has two sources", "3 saves + 1 load
  of 11.5 MB per settlement", "nothing in the app reads `errorMessage`".
- **Install path is for maintainers, not users.** Prerequisites: Node, Rust, `uv`, Python
  Mirror checkout, Pi on PATH, then a Settings → Runtime channel form with three paths and a
  user name. No signing/notarization yet (CV-009 planned).
- **The right question was already asked.**
  `docs/project/explorations/embedded-ts-runtime-full-control` (2026-09-21) proposes
  embedding Pi + Mirror TS in one bundled Node runtime. Its blockers were "wait for CV22
  maturity" — CV22 has since completed. The exploration is now actionable.

---

## 2. What Kia Desktop proved that transfers directly

| Kia decision | What it buys | How it maps to Mirror Desktop |
|---|---|---|
| D20/D22 — Pi engine as a **library**, not a subprocess | compaction, retry, steering, events come from the engine | Use `createAgentSession` / `AgentSessionRuntime` from `@earendil-works/pi-coding-agent` |
| D109/D112 — **embedded Node sidecar** (`kia-node`), hash-pinned fetch, bundler signs it with a shared `Entitlements.plist` (`allow-jit`) | zero prerequisites on the user's machine; notarization proven | Ship `mirror-node` the same way; both Pi and Mirror TS need Node 24 anyway |
| `bundle:mcp` — vendored npm packages with lockfile + `--ignore-scripts` | reproducible, offline, one tested set | Vendor `mirror-mind` + `@earendil-works/pi-coding-agent` into the bundle |
| D12 — local-first SQLite, tiny UI state in `tauri-plugin-store` | no heavy projection rewrites | Pi session JSONL = transcript, Mirror `memory.db` = memory, Desktop stores only UI state |
| D51/D65/D96 — signed auto-update, `release.yml` on tag, `latest.json` | one-click updates on 3 platforms | Keep the updater trust docs; adopt Kia's CI shape and `updateStore` doctrine ("checks fail silently, user actions fail loudly, confirm at the destructive boundary") |
| D108 + single-instance + deep link | OAuth in system browser returns to the running app | `mirrormind://` scheme for Pi provider OAuth and future "open journey" links |
| CV3.DS34 — **first steps** wizard, no welcome screen, state-computed suggestions | fast time-to-first-value | Onboarding = Mirror home + provider login + name/preferences, then straight into chat |
| Design system: Tailwind v4 tokens + Radix + lucide + sonner; Zustand stores; logging spine; i18n audit; fake-IPC E2E lane (D124); `knip` | small, beautiful, testable front end | Replace the 9.5k-line CSS and the monolithic `App.tsx` |

What does **not** transfer: Kia runs the agent loop *in the webview* with a backend model
proxy. Mirror Desktop needs real Pi tools (bash/fs), extensions, skills and `node:sqlite`,
so the agent must live in a Node process, not the webview. Kia's lesson is "embed the
runtime", not "run it in the browser".

---

## 3. The core proposal: one long-lived Node host

```
Tauri shell (Rust, thin)          mirror-host (Node sidecar, TS)              webview (React)
- window, menus, tray             - Pi SDK: one AgentSessionRuntime per      - UI only
- updater, dialogs, reveal          Journey (cwd = project_path)             - talks to host over
- deep link, single instance      - Mirror TS core imported as a library       localhost WS/JSON-RPC
- spawns/supervises the host        (journeys, memories, context, modes)       with a per-launch token
- hands the host a token+port     - local protocol server; UI bridge for
                                    Pi extension dialogs (confirm/select/input)
```

Why this shape:

- **No Rust in the hot path.** Text deltas stream host → webview directly; Rust only
  supervises. Today every event crosses Rust and 87 commands.
- **No spawn per turn.** Sessions stay warm; Mirror DB is opened once. Today a turn pays
  Pi boot + Python Mirror (~1.4 s for `mirror load` measured here) + multi-MB settlement
  writes.
- **Single conversation writer, solved structurally.** Load Mirror's own `mirror-logger`
  Pi extension inside the embedded session. Conversation logging then happens exactly as
  in terminal Pi (`session_start` / `before_agent_start` / `agent_end` /
  `session_shutdown`). The desktop never appends conversations itself → the outbox,
  journal, settlement frontier and generation files disappear, and the "no second writer"
  invariant is enforced by construction rather than by `--no-extensions`.
- **Selective extensions.** The SDK's `DefaultResourceLoader` lets the host choose:
  Mirror's extension + user provider packages (e.g. `pi-cc-patch`, `claude-bridge`) in;
  nothing blunt. CR070/CR071/CR072 dissolve.
- **Typed errors.** `stopReason: "error"` + `errorMessage`, retries, stalls arrive as
  data; CR054/CR159 and most of RS025 become presentation work.
- **Terminal ⇄ desktop continuity.** Sessions are plain Pi sessions under
  `~/.pi/agent/sessions/<cwd>`; `pi -r` in a terminal shows the same conversations;
  fork/branch come from `SessionManager`.

---

## 4. Ideas by goal

### Easy to install and start using

1. Installers for macOS (signed + notarized), Windows (`-setup.exe`), Linux (deb/AppImage)
   from one `release.yml`; signed auto-update from the first public build.
2. Bundle = Tauri app + `mirror-node` + vendored `mirror-mind` + Pi SDK. Release notes list
   the exact triple (Desktop/Pi/Mirror). Version skew ends.
3. First run: detect `~/.mirror-minds/*` and `~/.pi/agent/auth.json`; if absent, a 3-step
   wizard — (a) create Mirror home via `mirror init` (library call), (b) sign in to a model
   provider with Pi's OAuth/API-key flow rendered natively (SDK exposes
   `OAuthLoginCallbacks`, `ModelRuntime({ authPath })`), (c) OpenRouter key +
   name/preferences → seeds identity. Then the chat shell.
4. Remove the Runtime-channel binding form and PATH discovery entirely. Dev/stable isolation
   stays by bundle id + `MIRROR_USER` suffix, but automatic.

### Fast and responsive

5. Warm sessions + single DB handle. Prefetch `runMirrorLoad` when a Journey is opened,
   not per turn; embeddings computed async in the host.
6. Kill generation projections and per-settlement full rewrites (CR157). UI state only in
   `tauri-plugin-store`.
7. Zustand stores instead of one 7.6k-line component; memoized rows; virtualized
   transcript; `react-markdown` + `remark-gfm` with sanitization instead of the hand-rolled
   parser.
8. Optimistic UI (Kia doctrine): user message appears instantly; stall watchdog (120 s)
   names "stalled" instead of infinite "Thinking…".
9. Show the window immediately with a skeleton while the host boots in parallel.

### Easy to use

10. One chat per Journey + a conversations list (starred / recent / all) — Kia's sidebar.
    Formally remove Tactical/Strategic/Ariad surfaces (already disabled by policy).
11. Composer command palette listing Mirror skills (`/mm-journeys`, `/mm-build`, …) and Pi
    commands; SDK `prompt()` already expands extension commands and templates.
12. Mode pill in the header (Mirror/Builder/Explorer/Soul from `mode status` / welcome
    `statusLine`); persona chip rendering `◇ persona`.
13. Tool approval modal for mutating tools (bash/write/edit) — Kia's `ToolApprovalModal`
    pattern over Pi's `tool_call` hook; Pi's RPC extension-UI subprotocol already defines
    the three dialog shapes (confirm/select/input) the host must bridge.
14. Turn lock (Kia CR258): screen stays on the running conversation; "steer" and
    "follow up" as explicit buttons (`steer()`, `followUp()`).
15. pt-BR / en-US from day one with Kia's `audit-i18n-keys` gate.
16. Keep what already works: drafts, voice (whisper.cpp managed component), conversation
    search, attachments drag/drop, artifacts + Reveal in Finder, journey icons/custom
    images, turn sound, window geometry.

### Beautiful

17. Tailwind v4 token theme (dark/light/system) + Radix primitives + lucide + sonner; the
    curated themes become token sets, not 9.5k lines of CSS.
18. macOS native feel: overlay title bar with inset traffic lights, vibrancy sidebar;
    motion-safe reveals.
19. Transcript grammar borrowed from Pi's TUI: quiet user turns, assistant prose with
    proper tables/code/copy, tool calls as compact collapsible rows, thinking muted and
    collapsible.
20. Typography/brand aligned with mirrormind.sh (Kia pairs Syne/Work Sans — pick Mirror's
    own pair).

### Pi integration

21. `AgentSessionRuntime` per Journey with `cwd = project_path`;
    `newSession/switchSession/fork`; model picker from `ModelRuntime` catalog; thinking
    level; in-app `/login`; automatic + manual compaction; `abort()`.
22. `DefaultResourceLoader` with: Mirror package (extension + skills), user packages from
    `~/.pi/agent/settings.json`, Journey `.pi/` resources after trust.
23. Keep `RpcClient` as an optional "external Pi" setting for power users; embedded is the
    default.

### Mirror TS integration

24. Host imports `mirror-mind` directly: `listJourneyOptions`, `createJourney`,
    `setProjectPath`, `journeyMetadata`, `searchMemories`, `listRecentMemorySummaries`,
    `loadMirrorContext`, `runMirrorLoad`, `logMirrorResponse`, `activateOperatingMode`,
    `detectPersona`, conversation listing/recall. Anything still CLI-only (e.g. `journeys`
    rendering, tasks, week) becomes a Core-owned prerequisite: export it from
    `ts/src/index.ts` with tests and a release before the desktop consumes it — exactly the
    rule the migration handoff set.
25. Native screens over typed rows instead of terminal text: Journey status, memories per
    Journey, welcome card, tasks, week.
26. DB migrations run by Mirror on open (backup-first); the desktop shows a "migrating"
    state. About screen = `runtime status` + release notes.
27. Later optimisation (Core change): an in-process conversation-logger API so the
    extension stops spawning `bin/mirror.js` per event.

---

## 5. What to deliberately drop vs keep

**Drop:** dedicated thread/generation files, turn journal, settlement frontier, append
outbox, Python provisioning scripts, journey-projection contracts, runtime-binding UI, PATH
discovery, three altitudes, Ariad observatory (for now), 87 commands → ~15.

**Keep (with provenance):** updater channel + trust docs + release provenance, dev/stable
bundle split, voice transcription, artifacts/reveal boundary, journey appearance, drafts,
search, steering semantics, the "errors are part of the surface" principle.

---

## 6. Risks and open questions

- **Pi SDK stability:** pin the version; Kia needed `patch-package` on `pi-agent-core` —
  expect the same discipline.
- **Multiple sessions in one host:** `createAgentSession` can be called repeatedly, but
  shared `SettingsManager` / `ModelRuntime` state across Journeys needs a spike.
- **Bundle size:** Node sidecar grows the DMG from ~7 MB to roughly 30–40 MB; Kia accepted it.
- **`node:sqlite` experimental warning** on stderr — Mirror already lives with it.
- **Windows:** Pi has `docs/windows.md`; Kia ships Windows with the sidecar (`dunce` path
  fix, CR164).
- **Extension dialogs without a TUI:** the confirm/select/input bridge must exist before
  any extension that asks questions works.

---

## 7. Suggested first moves (spikes, not stories)

1. **Host prototype** — Node script: `createAgentSession` + `mirror-mind` library +
   `mirror-logger` extension loaded, one prompt streamed over a local WebSocket to a bare
   page. Measure boot and first-token latency; confirm the conversation lands in
   `memory.db` with no desktop append.
2. **Clean-machine bundle** — Tauri + `mirror-node` + vendored packages, signed with
   `allow-jit`, run under a fresh macOS user with no Node/Pi installed.
3. **In-app provider login** — Pi OAuth via deep link, token saved to `auth.json`.
4. Only then rebuild the UI on the new design system.
