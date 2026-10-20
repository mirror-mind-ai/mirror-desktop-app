# Mirror Desktop

The first-party desktop application for [Mirror Mind](https://github.com/mirror-mind-ai/mirror):
a place to operate Journey-bound Pi and Mirror conversations with native capabilities,
built with Tauri 2, React and a Node host that embeds Pi and the Mirror core as libraries.

This repository is the successor to
[`mirror-mind-ai/mirror-desktop`](https://github.com/mirror-mind-ai/mirror-desktop).
Start at the [documentation map](docs/index.md): the
[briefing](docs/project/briefing.md), the [decisions](docs/project/decisions.md),
the [roadmap](docs/project/roadmap/index.md) and the
[lineage](docs/project/history/predecessor.md).

## Layout

```text
apps/desktop        Tauri shell (Rust) and React UI
packages/host       Node 24 host: Pi SDK + Mirror core, served over a loopback socket
packages/protocol   the message contract between host and UI (zod)
```

## Development

Prerequisites: Node 24+, Rust stable, the
[Tauri 2 system prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run typecheck
npm test
npm run dev          # Tauri window with Vite hot reload on port 1421
```

Working rules for humans and coding agents live in [AGENTS.md](AGENTS.md).
