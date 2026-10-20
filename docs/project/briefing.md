[< Documentation](../index.md)

# Briefing

The stable premises of Mirror Desktop's second body. They change rarely and
only by a recorded [decision](decisions.md).

## What it is

Mirror Desktop is the first-party desktop application for Mirror Mind: the
place where a person operates Journey-bound Pi and Mirror conversations with
native capabilities. It is a body for the mirror, not a projection of it and
not a second agent runtime.

## Shape

```text
Tauri shell (Rust, thin)         mirror-host (Node 24, TypeScript)           webview (React)
window · updater · dialogs       Pi SDK: one AgentSession per conversation   presentation and
deep links · host lifecycle      Mirror core as a library (reads)             local interaction
spawns the host with a token     Mirror front door for writes                 state
reads the port it announces      loopback WebSocket, token-authenticated
```

Nothing in the turn hot path crosses Rust. The protocol between host and UI
is the contract (`packages/protocol`), validated on both sides.

## Ownership

- **Pi** owns the agent: sessions, transcripts, tools, extensions, skills,
  compaction, model access and credentials.
- **Mirror** owns identity, memory, Journeys, modes and conversation
  recording. The desktop reads it in-process and writes to it only through
  the front door.
- **The desktop** owns the human experience around those: screens, native
  capabilities, the host that holds both libraries, and the bundle that
  ships them.

## Invariants

- One Node process hosts every session; sessions are Pi sessions in Pi's own
  directory; a Journey has many.
- Everything the agent runs sees `MIRROR_SESSION_ID`; a session is bound to
  Mirror by name, never guessed.
- Conversation logging happens through Mirror's own extension inside the
  session; the desktop never appends a message.
- The bundle ships its runtime; a clean machine needs nothing installed.
- The Mirror core is consumed at its public surface; what it does not expose
  yet is a Core-owned prerequisite, never a local fork.
- Errors are part of the surface: a failed resource, a refused provider, a
  stalled turn are named, not hidden.

## Lineage

The first body, `mirror-mind-ai/mirror-desktop`, and what carries over from
it: [predecessor.md](history/predecessor.md). The design direction:
[the reinvention proposal](explorations/reinvention-proposal.md). The
evidence: the four [spikes](spikes/).
