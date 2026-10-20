# Mirror Desktop — Repository Instructions

Mirror Desktop is the first-party desktop application for Mirror Mind. This
repository is its second body: a clean successor to
`mirror-mind-ai/mirror-desktop` (see
[docs/project/history/predecessor.md](docs/project/history/predecessor.md)).
Read [docs/index.md](docs/index.md) first: briefing, decisions, the Ariad
roadmap. The founding design is
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
npm test                         # vitest, tests beside the code (*.test.ts)
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
- **TDD for behavior.** A feature or fix starts with a failing test; error
  paths carry the same burden as happy paths; `retry: 0`, a flaky test is
  fixed, never retried.
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
