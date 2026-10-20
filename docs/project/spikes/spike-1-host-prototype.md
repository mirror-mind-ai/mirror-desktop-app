# Spike 1 — Host prototype

**Date:** 2026-10-20
**Question:** can one Node process embed Pi (SDK) and the Mirror core, run a
real turn for a Journey directory with Mirror's own logger extension inside
the session, stream it to a webview, and leave the conversation in
`memory.db` without the desktop writing anything itself?

**Answer: yes.** Measured on this machine (M-series, Node 25.9, Pi 1.3.0,
Mirror 0.35.0, model `anthropic/claude-fable-5`, thinking `max` — the user's
own Pi defaults).

## What was built

- `packages/protocol` 0.2.0: `session.open/prompt/abort/close` requests and a
  projected `SessionEvent` union (`text_delta`, `tool_start/end`,
  `message_end` with `stopReason`/`errorMessage`, `retry`, `agent_settled`, …).
- `packages/host/src/sessions.ts`: a `SessionRegistry` creating Pi sessions
  with `createAgentSession` + `DefaultResourceLoader`, discovery as terminal
  Pi (`~/.pi/agent`, project `.pi/`) **plus the installed `mirror-mind`
  package as a Pi package** (its logger extension and skills). Sessions
  persist in `~/.pi/agent/sessions/<cwd>/`, so `pi -r` sees them.
- `packages/host/scripts/turn.ts`: one measured turn through the host.
- `apps/desktop/src-tauri/src/host.rs`: the shell mints a token, spawns
  `node packages/host/src/main.ts`, reads the announced port, exposes
  `host_endpoint` and emits `host-ready`.
- `apps/desktop/src/host/client.ts` + a spike console in `App.tsx`: open a
  session for a directory, send a prompt, watch it stream.

## Measurements

| Stage | Time | Notes |
|---|---|---|
| host process listening | 650–750 ms | Node + Pi SDK + Mirror core imported in one process |
| `session.open` | ~2.5 s | resource discovery, `createAgentSession`, then `bindExtensions` → Mirror logger's `session_start` runs `mirror conversation-logger session-start --fast --welcome` as a subprocess and detaches maintenance |
| prompt → first text delta | ~3.0 s | model-bound (thinking `max`) |
| turn with one `bash` tool call | 5.9 s | tool itself: 11 ms |
| `session.close` | ~6 s | `session_shutdown` → `session-end-pi` + `backup --silent` subprocesses |

Mirror side, verified after each run: the conversation appears in
`mirror conversations` (2 messages), gets retitled by maintenance, the log
shows `log-user` → `log-assistant` → `session closed`, and a backup zip is
written on close. The host wrote none of it.

## Findings

1. **`session.dispose()` does not emit `session_shutdown`.** Pi's modes emit it
   themselves before disposing; the host now does the same
   (`abort()` → `extensionRunner.emit({type: "session_shutdown"})` → `dispose()`).
   Without it the Mirror conversation stays open until maintenance closes it.
2. **Node refuses to strip types under `node_modules`.** The host registers a
   load hook scoped to the `mirror-mind` package (as Mirror's own bins do) and
   imports its server dynamically after registering it.
3. **Journey binding is not automatic.** The logged conversations carry no
   Journey because nothing activated a mode for the session. In a terminal
   that happens through `mirror build load <slug>` / `mirror mode activate`;
   the host must do the equivalent when it opens a session for a Journey.
4. **Closing is slow and must never block the UI.** Six seconds of Mirror
   subprocess work belong to app quit or to a background close, not to a
   click. Likewise the shell currently stops the host with `kill` (SIGKILL),
   so an app quit skips `session_shutdown`; the supervisor needs SIGTERM
   with a bounded wait.
5. **Open cost is discovery plus Mirror subprocesses**, paid once per
   session, not per turn. Warm sessions amortize it; prewarming the most
   recent Journey at launch would hide it.
6. **Model and thinking level come from the user's Pi settings.** The desktop
   will expose both; `thinking max` is a poor default for a chat surface.

## Not in this spike

- The product conversation UI (stores, components, markdown, tool rows).
- Bundling Node and the packages (spike 2), in-app provider login (spike 3).
- Steering/follow-up, compaction, extension dialogs, multiple concurrent
  sessions — all available in the SDK, none exercised yet.
