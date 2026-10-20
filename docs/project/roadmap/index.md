[< Project](../briefing.md)

# Roadmap

**Method:** Ariad ([adoption](ariad-adoption.md)) · **Journey:** `mirror-desktop`

The roadmap is organized as **CV → Delivery Story → Story**. A Capability
Value is a stage with a clear user-visible outcome; a Delivery Story is a
cohesive block inside it with a done condition; a Story (User or Technical)
is one verifiable delivery, with a `plan.md` and a `test-guide.md` before
implementation when non-trivial.

The guiding question: can a person open a Journey, converse with Pi inside
it with Mirror's memory and identity behind the words, and have it be the
place they prefer over the terminal — installed in one step, fast, calm?

---

## Capability Values

| Code | Capability Value | Outcome | Status |
|------|------------------|---------|--------|
| [CV0](cv0-foundation-spikes/index.md) | Foundation Spikes | The four questions that could sink the design are answered with running code: one host embeds Pi and Mirror; the bundle runs on a clean machine; sign-in happens in-app; a session is bound to a Journey by name | ✅ Done — 2026-10-20 |
| [CV1](cv1-daily-use/index.md) | Daily Use | A person opens a Journey and lives in the conversation: a real shell and transcript, the Journey's sessions, live control of a turn, and an app that quits and restarts cleanly — used daily instead of terminal Pi for Journey work | 🟡 Planned |
| CV2 | First Run | A new person installs the app and reaches a working conversation through one sequence: Mirror home, provider, OpenRouter key, name — with the state-aware suggestions a first screen can honestly offer | ⚪ Future |
| CV3 | Trusted Distribution | Signed, notarized builds for macOS from a release workflow, Windows and Linux bundles, and a self-update channel with the trust boundaries the first body established | ⚪ Future |
| CV4 | Mirror Surfaces | What Mirror knows, as screens rather than terminal text: the welcome card, Journey status, memories, tasks and the week, mode and persona made visible in the conversation | ⚪ Future |

CV2–CV4 are named horizons, not authored packages: each gets its folder and
Delivery Stories when it is next.

---

## Boundaries

- Mirror Desktop is a body for the mirror; Mirror Core owns identity, memory,
  Journeys and modes, Pi owns the agent.
- A capability the Mirror core does not expose yet is a Core-owned
  prerequisite in the [ledger](../history/predecessor.md#core-owned-prerequisites),
  not a local fork.
- The first body keeps serving its user until cutover; nothing here changes
  its repository, channel or data.

## References

- [Decisions](../decisions.md) · [Briefing](../briefing.md)
- [Reinvention proposal](../explorations/reinvention-proposal.md) · [Spikes](../spikes/)
- [Technical debt ledger](technical-debt-ledger.md)
