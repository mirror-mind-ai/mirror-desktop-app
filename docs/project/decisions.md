[< Documentation](../index.md)

# Decisions

Incremental design decisions, newest last. Each records what was decided,
why, and what it binds. Stable premises that no longer change live in the
[briefing](briefing.md); the reasoning that led here is in the
[reinvention proposal](explorations/reinvention-proposal.md) and the four
[spikes](spikes/).

---

## D1 — The second body is a new repository

**Date:** 2026-10-20

Mirror Desktop starts over in `mirror-mind-ai/mirror-desktop-app`. The first
body, `mirror-mind-ai/mirror-desktop`, is frozen in maintenance for its one
daily user and remains predecessor evidence, never a pattern library. The
rename choreography that gives the successor the canonical name is deferred
and documented in [predecessor.md](history/predecessor.md). A branch or a
subfolder was rejected: a rewrite that replaces the architecture never
merges, and a coding agent working beside 14k lines of the old design would
follow it.

## D2 — One long-lived Node host; the shell stays thin

**Date:** 2026-10-20 · **Spike:** [1](spikes/spike-1-host-prototype.md)

A single Node process embeds Pi (`@earendil-works/pi-coding-agent`, the SDK)
and the Mirror core (`mirror-mind`, the library) and serves the UI over a
loopback WebSocket behind a per-launch token. Rust owns the window, the
updater, dialogs, deep links and the host's lifecycle; nothing in the turn
hot path crosses it. This dissolves the process-per-turn machinery of the
predecessor — registry, journal, settlement frontier, outbox — rather than
reimplementing it.

## D3 — The protocol is the contract

**Date:** 2026-10-20

Every message between host and UI is a zod schema in `packages/protocol`,
validated on both sides. Pi's events are **projected** onto an explicit
union; an event nobody wrote down is not forwarded. The same schemas back
the fake host UI tests run against. A capability starts with its schema and
test, then the host, then the UI.

## D4 — The bundle ships its runtime

**Date:** 2026-10-20 · **Spike:** [2](spikes/spike-2-clean-machine-bundle.md)

The app embeds Node 24 LTS as the `mirror-node` sidecar (official archive,
SHA256 pinned in the repository, only the binary) and stages the host with
its production dependencies as resources. Signed under the hardened runtime
with `allow-jit`. The host materializes `node` and `mirror` shims on its
PATH, so everything the agent spawns finds the bundle's runtime and the
bundle's Mirror — in development too. A clean machine needs nothing
installed. Kia Desktop's D109/D112 are the precedent.

## D5 — Mirror is consumed at its public surface; writes go through the front door

**Date:** 2026-10-20 · **Spike:** [4](spikes/spike-4-journey-binding.md)

Reads use the core's own modules in-process on a read-only handle. The one
write that binds a session to a Journey runs `mirror mirror load --journey …
--session-id …` through the bundled bin — the command the `/mm-mirror` skill
runs — so the core keeps authority over every write. `packages/host/src/mirror.ts`
is the only file allowed to reach past `ts/src/index.ts`; each reach is a
Core-owned prerequisite in the [ledger](history/predecessor.md#core-owned-prerequisites),
implemented in the Mirror repository with tests and a release before the
desktop consumes it. The desktop never forks Mirror behavior and never
writes Mirror SQL.

## D6 — Single conversation writer: Mirror's own extension

**Date:** 2026-10-20 · **Spike:** [1](spikes/spike-1-host-prototype.md)

The Mirror package is loaded into every session as a Pi package, so its
logger extension and skills run exactly as in a terminal. Conversation
logging into `memory.db` happens there; the desktop never appends a
message. The predecessor's `--no-extensions` dilemma and append outbox do
not exist here.

## D7 — Conversations are Pi sessions, many per Journey

**Date:** 2026-10-20

A desktop conversation *is* a Pi session, stored where terminal Pi stores
its own (`~/.pi/agent/sessions/<cwd>/`), so `pi -r` and the desktop see the
same history and either can continue it. A Journey has **many** sessions,
listed per Journey, with "resume the most recent" as the default door; a
new session is a deliberate act. Branching and forking come from Pi's
`SessionManager` when a screen needs them.

## D8 — A session is bound to Mirror by name, never guessed

**Date:** 2026-10-20 · **Spike:** [4](spikes/spike-4-journey-binding.md)

Everything the agent runs sees `MIRROR_SESSION_ID` (the session file), and
the host names the session (`--session-id`) when it binds a Journey. Mirror's
fallback — the most recently updated session — is the mechanism that once
moved other Journeys' cursors in the predecessor; with several sessions open
it must never be reached.

## D9 — Provider sign-in through Pi's own flows; no deep link; shared `~/.pi/agent`

**Date:** 2026-10-20 · **Spike:** [3](spikes/spike-3-in-app-provider-login.md)

`ModelRuntime.login()` runs the provider's flow — OAuth with Pi's own
loopback callback server, device code, API key — and stores the credential
in `auth.json`, shared with terminal Pi. The host bridges the flow's two
needs (things to show, questions to answer) over the socket; the app's only
native job is opening the URL in the system browser. One `ModelRuntime`
serves every session, so a sign-in applies to the next turn.

## D10 — Bundle identifier `ai.mirrormind.mirror-desktop`

**Date:** 2026-10-20 · **Spike:** [2](spikes/spike-2-clean-machine-bundle.md)

Distinct from the predecessor's `ai.mirrormind.desktop` so the two never
share app data; the stable identifier is taken over only at cutover. Not
ending in `.app`: Finder shows such an app-data directory as an application
bundle.

## D11 — UI stack

**Date:** 2026-10-20

React 19, Vite, Tailwind v4 with theme tokens (dark/light/system by root
class), Zustand stores, lucide icons, sonner toasts, `react-markdown` with
sanitization for assistant prose. Tests beside the code, `retry: 0`; a flaky
test is fixed, never retried. Kia Desktop is the reference for the shape;
the palette and typography are Mirror's own.

## D12 — Ariad governs the roadmap from the first Delivery Story

**Date:** 2026-10-20

Adopted after the four spikes, deliberately not before: a spike is a
question, not a story. From here, work is pulled through the Ariad
lifecycle; the spikes stand as CV0, done, and their findings as decisions
above and prerequisites in the ledger.

## D13 — UI tests run against a fake host at the UI's two doors

**Date:** 2026-10-21 · **Story:** [CV1.DS1.TS1](roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/index.md)

The UI reaches the host through exactly two doors: the `host_endpoint` Tauri
command, and a WebSocket to the port it returns. UI tests replace those two
doors and nothing else, so `App` and `HostClient` run unchanged against a fake
host that follows the real one: the handshake, fan-out to every connection,
and the protocol checked both ways (D3).

The harness denies by default. A request, a socket, a network call or a Tauri
command nobody scripted is recorded and fails the test at teardown, because
the UI turns thrown errors into toasts.

The test environment follows the workspace: every desktop test runs in
happy-dom, with script evaluation and resource loading off, and packages run
in node. Fixtures are invented, never copied from a real session, and Tailwind
does not scan test sources, so tests never shape the shipped artifact. The
conventions are in AGENTS.md.

## D14 — Selecting a Journey shows it; the first send opens its session

**Date:** 2026-10-21 · **Story:** [CV1.DS1.US1](roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us1-shell-and-journeys-sidebar/index.md)

Opening a session writes: the host starts Pi in the Journey's project path,
and binds a Mirror conversation to it (D5, D8). In a sidebar, selecting is how
a person looks around, so the shell keeps looking apart from acting.
Selecting a Journey shows it, with its project path and its composer, and
writes nothing. The first send opens its session, which stays open for the
app run. Each picked Journey keeps its own conversation, draft and running
turn, and host events reach the conversation whose session they name.

The spike console opened a session on every click, which would have left an
empty Mirror conversation behind for every look around the sidebar. CV1.DS2
keeps the rule when sessions are listed and resumed: navigation never starts
Pi or binds a conversation, a send or an explicit choice does.
