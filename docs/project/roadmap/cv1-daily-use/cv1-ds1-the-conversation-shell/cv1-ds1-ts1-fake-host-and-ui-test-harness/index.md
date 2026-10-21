[< Parent](../index.md)

# CV1.DS1.TS1 — Fake host and UI test harness

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

In order to prove every screen of the conversation shell without a model,
As the Driver building CV1.DS1,
I want a fake host that speaks the protocol from fixtures, and a Vitest and happy-dom harness that renders the UI against it,
So that a UI test can open a Journey, send a prompt and assert the rendered stream with no Pi, no model and no network.

## Outcome

A host double speaking the protocol from fixtures, driven by Vitest with
happy-dom. A UI test opens a Journey, sends a prompt and asserts the rendered
stream with no Pi, no model and no network. The fake host holds the UI to the
contract: a fixture, or a request from the UI, that breaks the protocol fails
the test by name. US1, US2 and US3 write their UI tests on it.

## Acceptance Behavior

```text
Given a fake host scripted with one active Journey, one model and a streamed answer
When a UI test opens the Journey and sends a prompt
Then the transcript shows the prompt and the whole answer
And the fake host received exactly the requests the UI meant to send

Given a fixture, or a request from the UI, that breaks the protocol
When the test runs
Then it fails naming the fixture or the request

Given a UI test that reaches for the network
When it calls fetch or opens a socket other than the fake host's
Then it fails naming the attempt
```

## Scope

- The fake host, its in-memory socket and its turn fixtures.
- A happy-dom environment for UI tests, beside the node one, in one `npm test`.
- The proof test, on the console that exists today.
- The UI test conventions, recorded in AGENTS.md.

## Out Of Scope

- The shell, stores and tokens (US1), transcript rendering (US2) and the
  composer (US3).
- Fake host behavior no test uses yet: pausing or aborting a turn, sign-in
  flows, extension errors.
- End-to-end runs in the real Tauri shell, and host tests against a fake Pi.

## Validation

`npm test` runs the node and UI tests together, green and offline. A broken
fixture fails by name. The built app contains nothing of the harness. The
route is in the [test guide](test-guide.md).
