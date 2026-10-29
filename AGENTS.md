# Mirror Desktop — Repository Instructions

Mirror Desktop is the first-party desktop application for Mirror Mind. This
repository is its second body: a clean successor to
`mirror-mind-ai/mirror-desktop` (see
[docs/project/history/predecessor.md](docs/project/history/predecessor.md)).
Read [docs/index.md](docs/index.md) first: briefing, decisions, the Ariad
roadmap. How a session moves from Pull to Done, with its checkpoints and
gates, is the [development guide](docs/process/development-guide.md). The
founding design is
[docs/project/explorations/reinvention-proposal.md](docs/project/explorations/reinvention-proposal.md).

## Shape

```text
apps/desktop        Tauri 2 shell (Rust, thin) + React UI (Vite, Tailwind v4, Zustand)
packages/host       Node 24 process embedding Pi (SDK) and the Mirror core (library),
                    serving the UI over a loopback WebSocket
packages/protocol   zod schemas for every message between host and UI; also backs
                    the fake host used by UI tests
```

Rust owns the window, updater, dialogs, deep links and the host's lifecycle.
The host owns sessions, journeys, memory and everything that talks to Pi or
Mirror. The UI owns presentation and local interaction state. **Nothing in
the turn hot path crosses Rust.**

## Commands

```bash
npm install                      # workspaces: protocol, host, desktop
npm run typecheck                # tsc in every workspace
npm test                         # vitest from the root: packages in node, every desktop test in happy-dom
npx vitest run <path> --project desktop   # one desktop test; always from the root, never from apps/desktop
npm run build                    # tsc + vite build of the UI
npm run dev                      # tauri dev (Vite on port 1421)
MIRROR_HOST_TOKEN=x npm run host # run the host alone; prints {"event":"listening",...}
npm run turn --workspace packages/host -- --journey <slug> --prompt "…"   # one measured turn, bound to a Journey
HOME=/tmp/fresh npm run login --workspace packages/host -- --provider anthropic --type oauth --select browser --cancel-on-url
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run bundle --workspace apps/desktop   # .app + .dmg with the embedded Node and the staged host
                                          # (APPLE_SIGNING_IDENTITY="…" to sign; ad-hoc otherwise)
```

## Rules

- **Node 24 is the floor, and the bundle ships its own.** The host and the
  Mirror core run TypeScript with no build step on the embedded
  `mirror-node` sidecar (fetched hash-pinned from nodejs.org at build time)
  over the staged host in the app's resources. Node refuses to strip types
  under `node_modules`, so the host registers a load hook for the
  `mirror-mind` and protocol packages only (`packages/host/src/typeStripping.ts`)
  and imports the server dynamically after it. Keep host code
  erasable-syntax only (no enums, no parameter properties).
- **Children find the bundle's `node` and `mirror`.** The host prepends a
  bin directory of shims to its PATH (`packages/host/src/runtimeBin.ts`);
  never rely on the machine's PATH for either, in development included.
- **Paths from URLs go through `fileURLToPath`**, never `URL.pathname`:
  "Mirror Desktop.app" has a space.
- **The protocol is the contract.** Every message is validated with the
  schemas in `packages/protocol` on both sides. A new capability starts with
  its schema and its test, then the host, then the UI.
- **Mirror and Pi are consumed as libraries, at their public surfaces.** The
  Mirror core is `mirror-mind/ts/src/index.ts`; Pi is
  `@earendil-works/pi-coding-agent`. A capability the Mirror core does not
  expose yet is a Core-owned prerequisite: it is implemented in the Mirror
  repository with its own tests and release, recorded in
  `docs/project/history/predecessor.md`, and only then consumed here. Never
  fork Mirror behavior in this repository. `packages/host/src/mirror.ts` is
  the one file allowed to reach past the public surface, and each reach is
  listed in that ledger.
- **A session is bound to Mirror by name.** Everything the agent runs sees
  `MIRROR_SESSION_ID` (the session file); Journey binding goes through
  `mirror mirror load --journey … --session-id …`, the front door, never
  through SQL writes from this repository.
- **Single conversation writer.** Conversation logging into `memory.db`
  happens through Mirror's own Pi extension inside the embedded session. The
  desktop never appends conversations itself.
- **The predecessor is evidence, not a pattern library.** Code carried over
  from `mirror-mind-ai/mirror-desktop` is copied deliberately with a
  provenance note; its settlement, journal, outbox and projection designs are
  not reintroduced.
- **The UI's state lives in stores**, one per concern as
  `apps/desktop/src/<concern>/store.ts` (host, journeys, conversations): data
  only, from one initial state, with the actions exported beside it and
  tested against a stub connection, no DOM. Every store registers itself for
  reset. How to write and read them, the selector rule included, is at the
  top of `apps/desktop/src/stores/registry.ts`.
- **Colors and type come from the tokens** in `apps/desktop/src/styles/app.css`
  (D15), never from Tailwind's palette or sizes, which the stylesheet clears.
  A new color or size is a token first, in both themes;
  `styles/tokens.test.ts` holds every class in the app to the tokens. Pi's
  transcript roles (Markdown, syntax, thinking, the tool grounds) are tokens
  too, and highlighted code is colored by Pi's mapping, one block of
  `app.css`. Tailwind emits a token only for a class it finds whole in a
  source, so a class name is never assembled from pieces.
- **The model's text is input** (D16). The transcript
  (`apps/desktop/src/transcript/`) never renders raw HTML (no `rehype-raw`),
  keeps a link's target only for `https` and opens it through the opener,
  never in the window, shows an image as its alt text, and marks hidden
  characters in code. A bump of `react-markdown`, `remark-gfm` or
  `rehype-highlight` is reviewed as a security change; the tests over the
  `unsafe-answer` fixture are its net.
- **Looking writes nothing** (D14). Picking a Journey shows its most
  recent session, read from its file; picking a session or "New session"
  is a look too. The first send opens the session shown, resuming its file
  or starting a new one; navigation never starts Pi or binds a Mirror
  conversation. The host keeps one open session per Journey: the open
  closes the one before (`packages/host/src/sessionPolicy.ts`), and the UI
  never asks for a close. A file the UI names is read or resumed only when
  it is one of the Journey's sessions (`sessionIndex.ts`, by realpath).
- **TDD for behavior.** A feature or fix starts with a failing test; error
  paths carry the same burden as happy paths; `retry: 0`, a flaky test is
  fixed, never retried.
- **UI tests run against the fake host** (`apps/desktop/src/testing/`, whose
  modules say how each part works). Every desktop test runs in happy-dom with
  no Pi, no model and no network.
  - Compose the app through `renderApp()`, which resets every store first,
    and script the world with `serveFakeHost({ models, journeys, turns })`.
    Fixtures come from `loadTurn()`, and a held turn is released step by
    step. Invented Journeys and turns for the shell are in
    `testing/worlds.ts`, and the shared screen queries in
    `testing/queries.ts`.
  - A world scripts each Journey's sessions on disk with `sessions`
    (Garden's are `gardenSessions` in `worlds.ts`), which the fake host
    lists, reads and resumes as the real host does, its disk kept as Pi
    keeps one (`testing/fakeDisk.ts`); `closedSessions` says
    which sessions a later open closed. A world scripts the real host's
    failures with `failures` (`hello`, `journeys.list`, or one Journey's
    `session.open`, `sessions.list` or `session.transcript`), answered until the
    test calls `stopFailing()`; `heldOpens` holds a `session.open` until
    `heldOpen(journey).release()`; a scripted turn's `extensionErrors` are
    reported after its prompt's answer and before its events, as an
    extension failing inside Pi. A scripted failure or hold the test never
    exercised fails it at teardown.
  - happy-dom applies no CSS. A test that must prove which rule of
    `app.css` styles an element reads the stylesheet with
    `testing/stylesheet.ts`, which models the cascade those rules need.
  - Find elements by role, label or text, the way a person does; use
    `data-testid` only where nothing accessible names the element. Act
    through `userEvent.setup()`; wait with `findBy*`/`waitFor`, never a fixed
    delay.
  - Anything the harness forbids fails the test by name at teardown, even when
    the UI swallowed the error: an unscripted request or Tauri command, a
    socket or network call elsewhere, a turn never played, a `console.error`.
    A failing test prints the fake host's traffic log after it.
  - A new privileged Tauri call is scripted with `scriptIpc` and its arguments
    are asserted.
  - The theme boots in `renderApp()` exactly as in `main.tsx`, against a
    window whose two theme commands are answered; `windowCalls()` reads
    what the window was told. A test flips the OS with
    `setSystemAppearance()` (happy-dom re-checks a media query only on
    resize). Each test starts with its own empty `localStorage`, no theme
    class and a light system (`testing/appearance.ts`).
  - Fixtures and worlds are invented and inert: no real paths (only
    `/Users/test/`), no real session or tool text, nothing shaped like a
    secret. The loader refuses them in a turn, the fake host in a world's
    sessions. UI tests never enable script evaluation.
  - Harness code lives only under `apps/desktop/src/testing/`, never in a
    staged package. App code never imports it, and a test enforces that.
- **TypeScript strict, no `any`;** casts only at SDK boundaries with a reason.
  Comments explain *why*. English in code, tests, docs and commits.
- **Small commits that explain why.** Commit the coherent changes of each
  turn before reporting completion. Never commit secrets, `.env` files,
  dependencies, build outputs or the Node sidecar binaries.
- **Mirror journey:** `mirror-desktop`, governed by Ariad. Builder Mode
  activation is context setup only; implementation starts on explicit
  instruction, through the Ariad lifecycle. Keep `docs/project/decisions.md`,
  the roadmap and `docs/process/worklog.md` in the same commit as the change
  they describe.
