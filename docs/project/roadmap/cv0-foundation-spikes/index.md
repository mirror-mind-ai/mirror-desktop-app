[< Roadmap](../index.md)

# CV0 — Foundation Spikes

**Status:** ✅ Done — 2026-10-20
**Goal:** Answer, with running code, the four questions the reinvention depended on before any product work.

---

## What This Is

The [reinvention proposal](../../explorations/reinvention-proposal.md) rested
on four claims. Each became a spike — a question with a measured answer —
rather than a story. Their findings are now [decisions](../../decisions.md)
D2–D10 and the [Core-owned prerequisites](../../history/predecessor.md#core-owned-prerequisites).

## Spikes

| Spike | Question | Answer |
|-------|----------|--------|
| [1 — Host prototype](../../spikes/spike-1-host-prototype.md) | Can one Node process embed Pi and the Mirror core, run a real turn with Mirror's logger inside the session, and stream it to a webview? | Yes. Host up in ~700 ms; conversation logged by Mirror, never by the desktop |
| [2 — Clean-machine bundle](../../spikes/spike-2-clean-machine-bundle.md) | Can the app ship Node, Pi and Mirror, signed under the hardened runtime, and run with nothing installed? | Yes. 67 MiB DMG; embedded Node 24 with `allow-jit`; shims for `node` and `mirror` |
| [3 — In-app provider login](../../spikes/spike-3-in-app-provider-login.md) | Can a person sign in to a provider from the app, with the credential where Pi keeps it? | Yes, without a deep link: Pi's own flows bridged over the socket |
| [4 — Journey binding](../../spikes/spike-4-journey-binding.md) | Can a session carry its Journey from the first message, know its context, and bind every `mirror …` it runs by name, with several sessions open? | Yes, through the front door; two core limitations found and recorded |

## Done Condition

Every spike answered with running, committed code and a measured record. Met.
