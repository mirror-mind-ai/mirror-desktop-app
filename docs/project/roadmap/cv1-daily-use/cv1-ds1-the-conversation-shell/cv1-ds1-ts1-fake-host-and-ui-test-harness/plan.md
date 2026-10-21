# Plan — CV1.DS1.TS1

## Objective

Give the UI a way to be proven without a real host. A fake host speaks the
protocol from fixtures, and a Vitest and happy-dom harness renders the app
against it, so a UI test can open a Journey, send a prompt and assert the
rendered stream with no Pi, no model and no network. Every later DS1 story
writes its UI tests on this harness, so it is built first.

## Scope

1. **UI test environment.** A `*.test.tsx` file under `apps/desktop` is a UI
   test: it runs in happy-dom, with a setup that installs the network guard
   and cleans up after each test. Every other test keeps running in node. One
   `npm test` runs both, with `retry: 0`.
2. **The fake host** (`apps/desktop/src/testing/fakeHost.ts`). A test installs
   it with a scripted world: host identity, models, Journeys and the turns to
   play. It answers `hello`, `models.available`, `journeys.list`,
   `session.open` and `session.prompt`, and after a prompt it plays the next
   scripted turn as session events. Every request it receives is checked
   against `ClientRequest`, and every message it sends against `HostMessage`.
   A request that breaks the protocol, or one the test did not script, fails
   the test and names the request.
3. **Turn fixtures** (`apps/desktop/src/testing/fixtures/`). A fixture is a
   JSON list of session events, checked against the protocol's `SessionEvent`
   when it is loaded. A broken fixture fails naming the file and the event.
   TS1 ships one, a plain streamed answer, written in the order the host's
   projection (`projectEvent` in `packages/host/src/sessions.ts`) emits a
   turn.
4. **The proof test** (`apps/desktop/src/App.test.tsx`). It renders the
   console the way `main.tsx` does, in StrictMode. It opens a Journey, sends a
   prompt, sees the prompt and the whole streamed answer, and sees Send come
   back when the turn settles. It also asserts that the fake host received
   exactly the `session.open` and `session.prompt` the UI meant to send.
5. **The harness's own tests** (`apps/desktop/src/testing/fakeHost.test.ts`):
   the broken fixture, the request that breaks the protocol, the unscripted
   request, and the network guard each fail by name.
6. **Dev dependencies:** `happy-dom`, `@testing-library/react` and its peer
   `@testing-library/dom`.
7. **Conventions in AGENTS.md:**
   - where UI tests live and how they get a fake host;
   - how they find elements: by role, label or text, the way a person does,
     with `data-testid` only where nothing accessible names the element.

## Non-Goals

- Do not implement sibling roadmap item: Shell and Journeys sidebar.
- Do not implement sibling roadmap item: Transcript rendering.
- Do not implement sibling roadmap item: Composer.
- No production code changes. The console, `HostClient` and `main.tsx` run
  unchanged; US1 replaces the console and moves the proof test with it.
- Fake host behavior no test uses yet: pausing a turn mid-stream, abort,
  sign-in flows, extension errors. The story that first needs one adds it.
- Recording fixtures from a real turn. A later recorder could extend
  `npm run turn`.
- End-to-end runs in the real Tauri shell, host tests against a fake Pi, and
  CI.
- Changing the protocol, or how the real client treats a message that breaks
  it. That defect was found while planning and is reported separately.

## Acceptance Behavior

```text
Given a fake host scripted with one active Journey, one model and the streamed-answer fixture
When a UI test renders the app, opens the Journey and sends "Hello"
Then the transcript shows "Hello" and the fixture's whole answer
And Send is available again once the turn settles
And the fake host received session.open for that Journey and session.prompt with "Hello"

Given a fixture whose events break the protocol
When the fake host loads it
Then the test fails naming the fixture and the offending event

Given the UI sends a request that breaks the protocol, or one the test did not script
When the test ends
Then it fails naming the request

Given a UI test that reaches for the network
When it calls fetch, or opens a socket to anything but the fake host
Then it fails naming the attempt

Given the whole suite
When npm test runs
Then the node tests and the UI tests run in one command with retry 0, all green
```

## Approach

The UI reaches the host through exactly two doors: Tauri's `host_endpoint`
command, and a WebSocket to the port that command returns. The harness
replaces both doors, and nothing else.

- `mockIPC` from `@tauri-apps/api/mocks` answers `host_endpoint` with the
  fake host's endpoint.
- `vi.stubGlobal("WebSocket", …)` installs an in-memory socket wired to the
  fake host.

`App` and `HostClient` run unchanged, so the proof test exercises the real
client: correlation, hello and validation. That is mocking the boundary, not
the core.

The order is test first. First the harness's own tests (fixture validation,
protocol violations, the guard), then the fake host that satisfies them, then
the proof test against the real console.

## Risks

- happy-dom may lack an API the console touches, such as `scrollTo`. The fix
  is a polyfill in the UI test setup, named and commented; production code is
  never touched for a test.
- StrictMode connects twice and closes the first connection. The fake host
  accepts that the way the real host does.
- Socket events arrive outside React's act(). The proof test waits with
  Testing Library's async queries rather than fixed delays.

## Validation Route

- Automated: `npm run typecheck`, `npm test`, `npm run build` and
  `git diff --check`. After the build, a search of `apps/desktop/dist` finds
  nothing of the fake host.
- Navigator: the five steps in the [test guide](test-guide.md).
  - The suite passes offline.
  - A fixture broken by hand fails by name.
  - The proof test reads like the outcome.
  - The built app carries no harness.
- Pass: every step behaves as the test guide says. Fail: any step does not.

E2E decision: not required. TS1 changes no production code. The build and the
dist search prove the app still builds without the harness in it, and the
proof test drives the real `App` and `HostClient`. Approving this plan accepts
that fixture-level route in place of a run in the real shell.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.TS1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- the console cannot run under happy-dom without a production code change

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
