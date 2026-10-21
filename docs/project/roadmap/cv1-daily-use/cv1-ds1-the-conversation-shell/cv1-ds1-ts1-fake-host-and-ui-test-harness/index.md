[< Parent](../index.md)

# CV1.DS1.TS1 — Fake host and UI test harness

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to prove every screen of the conversation shell without a model,
As the Driver building CV1.DS1,
I want a fake host that speaks the protocol from fixtures, and a Vitest and happy-dom harness that renders the UI against it,
So that a UI test can open a Journey, send a prompt and assert the stream as it renders, with no Pi, no model and no network.

## Outcome

A host double speaking the protocol from fixtures, driven by Vitest with
happy-dom. A UI test opens a Journey, sends a prompt and watches the answer
stream in, with no Pi, no model and no network. The harness holds the UI to
the contract: a fixture, a request, a socket, a network call or an IPC command
it does not allow fails the test by name, even when the UI swallowed the
error. US1, US2 and US3 write their UI tests on it.

## Acceptance Behavior

```text
Given a fake host scripted with one active Journey, one model and a held streamed answer
When a UI test opens the Journey and sends a prompt
Then the test watches the answer stream in, Stop while it runs and Send once it settles
And the fake host received exactly the requests the UI meant to send

Given a fixture, or anything the UI does, that the harness forbids
When the test ends, even if the UI swallowed the error
Then it fails naming what was attempted

Given two UI tests in one file
When they run in either order
Then neither sees the other's events
```

## Scope

- The harness: a violation recorder, a faithful socket double, the fake host,
  held turns, a fixture loader, a network guard, a strict IPC door, one
  composition root and the setup that ties them together.
- A desktop project in happy-dom beside the node one, in one `npm test`.
- The first fixture, structured like a real turn with invented content.
- The proof test, on the console that exists today.
- Tailwind no longer scans test sources.
- The UI test conventions, recorded in AGENTS.md.

## Out Of Scope

- The shell, stores and tokens (US1), transcript rendering (US2) and the
  composer (US3).
- The effect of Stop, sign-in flows, extension errors, and error answers that
  mimic the host.
- The cold-start endpoint path, owned by CV1.DS2.TS1.
- End-to-end runs in the real Tauri shell, and host tests against a fake Pi.

## Validation

`npm test` runs both projects green. Forbidden things fail by name. The
shipped JS is byte-identical to the base build. The route is in the
[test guide](test-guide.md); the review behind this plan is in
[plan-review.md](plan-review.md).
