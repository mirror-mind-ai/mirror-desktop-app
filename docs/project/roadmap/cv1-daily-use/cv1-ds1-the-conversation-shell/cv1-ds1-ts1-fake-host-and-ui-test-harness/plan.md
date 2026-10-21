# Plan — CV1.DS1.TS1

## Objective

Give the UI a way to be proven without a real host. A fake host speaks the
protocol from fixtures, faithfully enough that a broken UI cannot pass and
strictly enough that anything the harness forbids fails the test by name, even
when the UI swallows the error. A UI test can open a Journey, send a prompt,
and assert the stream as it renders, with no Pi, no model and no network.
Every later DS1 story writes its UI tests on this harness, so it is built
first.

This is the second version of the plan, revised after a four-lens review; see
[Plan review](#plan-review).

## Scope

1. **Test environment by workspace.** Vitest runs two projects from the root:
   - `node`: `packages/**/src/**/*.test.ts`;
   - `desktop`: every `apps/desktop/src/**/*.test.{ts,tsx}`, in happy-dom,
     built on the app's own Vite config, with the harness setup.

   Both have `retry: 0`, and one `npm test` runs both. happy-dom is at least
   version 20. Its posture is set explicitly: no script evaluation, no
   JavaScript, CSS or iframe loading, no navigation, and a page URL that
   cannot resolve (`http://mirror.invalid/`).
2. **The harness** (`apps/desktop/src/testing/`). Each module is tested on its
   own:
   - `violations.ts`, one recorder. Anything forbidden is recorded with what
     was attempted, and `verify()` fails the test at teardown listing every
     violation, even when the UI caught the error.
   - `fakeSocket.ts`, a WebSocket double faithful where `HostClient` depends
     on one:
     - `open` fires in a later task;
     - frames are strings, delivered one per task;
     - `close()` behaves like a real close;
     - only `ws://127.0.0.1:<port>`, with the port the fake endpoint handed
       out, connects. Any other address is refused and recorded.
   - `fakeHost.ts`, the protocol server, following `server.ts`:
     - **Handshake:** `hello` comes first, with the endpoint's exact token
       and `PROTOCOL_VERSION`.
     - **Requests answered:** `models.available`, `journeys.list`,
       `session.open` for a scripted Journey with a project path, and
       `session.prompt` for a session it opened, whose text matches the next
       scripted turn.
     - **Events:** sent to every open, authenticated connection, as the real
       host does.
     - **Checks:** every request is checked against `ClientRequest` and every
       message against `HostMessage`. The scripted world is checked at
       install against `HostIdentity`, `AvailableModel` and `Journey`.
     - **Ids and clock:** deterministic (`session-1`, a fixed clock).
     - **Anything else** (an unscripted type, an unknown Journey or session,
       no turn left, a prompt that does not match) is answered at once with a
       named harness error and recorded.
     - **Unplayed turns:** a scripted turn never prompted is recorded.
   - **Held turns.** A scripted turn can be held: the test releases its
     events step by step or all at once. This lets a test watch the stream
     and the running state ([D1](#plan-review)).
   - `turns.ts`, fixtures as JSON, checked when used, failing by file, event
     index and problem. Each fixture must:
     - match `SessionEvent` event by event;
     - make sense as a turn: it opens with `agent_start` and closes with
       `agent_settled`, its deltas sit inside an assistant message, and the
       assistant's `message_end.text` equals the joined deltas;
     - carry no field the schema does not describe;
     - contain no secret-shaped string, and no home path except the
       invented `/Users/test/`.

     A sweep test loads every fixture, used or not.
   - `networkGuard.ts` blocks `fetch`, `XMLHttpRequest`, `EventSource` and
     `navigator.sendBeacon`, and records each attempt with its URL.
   - The IPC door, via `mockIPC`:
     - it answers only scripted commands (`host_endpoint` in TS1);
     - it records every `invoke` with its arguments;
     - it refuses and records anything else, `plugin:*` commands included.
   - `renderApp.tsx`, the only place tests compose the app, mirroring
     `main.tsx`.
   - `setup.ts` owns every global the harness touches and installs it for
     each test. Teardown runs in one fixed order:
     1. unmount;
     2. cancel pending frames;
     3. `verify()`;
     4. clear the IPC mocks;
     5. restore globals.

     An unexpected `console.error` fails the test. On failure, the harness
     prints the fake host's traffic log ([D6](#plan-review)): connections,
     requests, responses, events with their target connection, and blocked
     attempts.
3. **The first fixture**, `streamed-answer.json`. Its content is invented:
   - at least three text deltas, one boundary on whitespace or a newline;
   - an answer that shares no words with the prompt or the session header;
   - an event structure that matches one real turn's
     ([D2](#plan-review)).
4. **The proof test** (`apps/desktop/src/App.test.tsx`) runs the console
   through `renderApp`, acting with `userEvent` and waiting with async
   queries. A second test in the same file ends in the middle of a turn, to
   prove nothing leaks into the next test.
5. **A dependency-direction test.** App sources never import `testing/` or
   `@testing-library`.
6. **Tailwind stops scanning test sources** (`@source not` in
   `src/styles/app.css`), so test words never become production CSS
   ([D5](#plan-review)).
7. **Dev dependencies:**
   - `happy-dom` (at least 20);
   - `@testing-library/react` and its peer `@testing-library/dom`;
   - `@testing-library/user-event`.

   `package-lock.json` is committed with them.
8. **Conventions in AGENTS.md:**
   - every desktop test runs in happy-dom with the harness;
   - tests compose the app through `renderApp`;
   - find elements by role, label or text, and use `data-testid` only where
     nothing accessible names the element;
   - act through `userEvent.setup()`, and wait with `findBy*`/`waitFor`,
     never fixed delays;
   - fixtures and worlds are invented and inert;
   - UI tests never enable script evaluation;
   - a privileged IPC call is scripted and its arguments asserted;
   - harness code lives only under `apps/desktop/src/testing/`, never in a
     staged package;
   - tests run from the root;
   - where the traffic log appears.

   The stale `*.test.ts` lines and the `vitest.config.ts` comment are
   corrected.

## Non-Goals

- Do not implement sibling roadmap item: Shell and Journeys sidebar.
- Do not implement sibling roadmap item: Transcript rendering.
- Do not implement sibling roadmap item: Composer.
- **No production behavior changes.** `App`, `HostClient` and `main.tsx` run
  unchanged. The one production file touched is `app.css`, for Tailwind's
  scan, which changes no behavior. US1 replaces the console and moves the
  proof test with it.
- **Fake host behavior no test uses yet:**
  - the effect of Stop (abort);
  - sign-in flows;
  - extension errors;
  - error answers that mimic the host (`journey_not_found`,
    `session_not_found`, …).

  In TS1 those are violations; the story that first needs one adds it.
- **Real content in fixtures, and a fixture recorder.** The real turn is used
  for its event structure only ([D2](#plan-review)).
- **The cold-start endpoint path.** When `host_endpoint` returns nothing, the
  UI waits for `host-ready`; that path is owned by CV1.DS2.TS1, Lifecycle
  hygiene.
- **Pinning StrictMode's connection lifecycle in the proof test**
  ([D3](#plan-review)). Fan-out and exact matching already turn the
  doubled-answer bug red.
- End-to-end runs in the real Tauri shell, host tests against a fake Pi, and
  CI.
- Changing the protocol, or how the real client treats a message that breaks
  it. That defect was found while planning and is reported separately.

## Acceptance Behavior

```text
Given a fake host scripted with one active Journey, one model and a held streamed-answer turn for "Hello"
When a UI test opens the Journey and sends "Hello"
Then "Hello" is shown and Stop replaces Send
And after two text chunks are released, the partial answer is shown
And after the assistant message ends, the whole answer is shown, matched exactly and after the prompt, with Stop still shown
And after the turn settles, Send is back, and typing a draft enables it
And the fake host received hello with the endpoint's token, exactly one session.open for that Journey, and exactly one session.prompt for the session it opened, with "Hello"

Given a fixture that breaks the protocol, the shape of a turn, or the synthetic-content rules
When a test uses it, or the fixture sweep runs
Then it fails naming the file, the event and the problem

Given the UI does something the harness forbids: a request that breaks the protocol or that nobody scripted, a socket to another address, a network call, or an IPC command nobody scripted
When the test ends, even if the UI swallowed the error
Then the test fails naming what was attempted

Given two UI tests in one file, the first ending in the middle of a turn
When they run, in either order
Then neither sees the other's events

Given the whole suite
When npm test runs from the root
Then the node and desktop projects run in one command with retry 0, all green, and every test file collected before TS1 is still collected
```

## Approach

The UI reaches the host through exactly two doors: Tauri's `host_endpoint`
command, and a WebSocket to the port it returns. The harness replaces both and
nothing else, so `App` and `HostClient` run unchanged. The proof test covers
the client's correlation, its hello and its parsing of valid messages. How the
client treats an invalid message stays unexercised; that is the separately
reported defect.

The order is test first, one module at a time:

1. the recorder;
2. the socket double;
3. the fixture loader;
4. the fake host;
5. the guard and the IPC door;
6. the setup and the Vitest projects;
7. the proof test;
8. the red runs and the evidence.

Before the fixture is written, one real turn is captured for its structure
([D2](#plan-review)). The Navigator names the Journey it runs on, since a real
turn writes a conversation to their Mirror. The capture runs
`npm run turn --workspace packages/host -- --journey <slug>`, and only the
sequence of event types, roles and stop reasons enters the evidence. If the
Navigator declines, the loader's turn invariants stand alone, and the evidence
says so.

## Risks

- **A missing browser API.** happy-dom may lack something the console touches,
  such as `scrollTo`. The fix is a polyfill in `setup.ts`, named and
  commented; production code is never touched for a test.
- **act() warnings.** Because a `console.error` fails the test, async updates
  must be awaited properly (`findBy*`, `waitFor`), never silenced.
- **Tailwind's exclusion paths.** They are relative to `app.css`. The artifact
  check shows whether they took effect.
- **happy-dom setting names** differ between majors. The installed version's
  own settings are used and the posture is checked by a canary test: a
  `<script>` that must not run.

## Validation Route

- **Automated**, in the [test guide](test-guide.md):
  - The chained gate: typecheck, test, build and `git diff --check`.
  - **The collection diff.** The node set is unchanged, the additions are
    exactly TS1's files, and each desktop file is collected once.
  - **Artifact identity.** The base and story commits are each built from a
    fresh worktree after `npm ci`, and their dist manifests are compared.
    - The JS must be identical.
    - The CSS must be identical, except for rules that existed only because
      Tailwind scanned `reduceRows.test.ts`. Each such rule is listed.
    - The production dependencies in the lockfile must be identical.
  - **The committed state** passes `npm ci && npm test && npm run build`. The
    story worktree above doubles as this check.
  - **Red runs.** Each mutation turns the proof test red, and each is
    recorded:
    - `reduceRows` replacing text instead of appending it;
    - `agent_settled` no longer clearing busy;
    - the `if (cancelled)` branch removed;
    - every event delivered twice;
    - a different Journey sent.
  - **Determinism:** one shuffled run with a fixed seed, and 20 consecutive
    runs of the desktop project.
  - **Structure capture:** the fixture's event sequence against the real
    turn's.
- **Navigator:** the four steps in the test guide.
  1. Both projects run green.
  2. Three deliberate violations each fail by name: a network call, a missing
     turn and a broken fixture.
  3. Checkable statements about the proof test hold.
  4. The artifact evidence reads as the plan says.
- **Pass:** every check and step behaves as the test guide says. **Fail:** any
  one does not.

E2E decision: not required. The waiver rests on artifact identity
([D5](#plan-review)): the shipped JS is byte-identical, and every CSS
difference is listed and explained. If anything else differs, stop and run
the real app.

## Plan Review

On 2026-10-21 the first version of this plan was reviewed by four isolated
reviewers: quality-assurance, engineer, devops-engineer and security-engineer.
A separate synthesis merged their findings. The synthesis and the decisions
taken are in [plan-review.md](plan-review.md). This version adopts its
findings, with the Navigator's rulings:

- **D1:** held turns, so the proof test watches the stream and the running
  state.
- **D2:** the real turn is captured for its event structure only; fixture
  content is invented.
- **D3:** the proof test asserts per request type, not StrictMode's connection
  lifecycle.
- **D4:** the test environment follows the workspace; every desktop test runs
  in happy-dom.
- **D5:** Tailwind stops scanning test sources. The rule becomes "no
  production behavior changes", and the waiver rests on artifact identity.
- **D6:** the traffic log is printed on failure, alongside enforced
  invented-content rules.

Trimmed from the review:

- Determinism evidence is one shuffled run and 20 consecutive runs, not runs
  under CPU load.
- The artifact comparison replaces the grep and its positive control.
- The content rules carry no allowlist until one is needed.
- The cold-start path goes to CV1.DS2.TS1.

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
- the console cannot run under happy-dom without a production behavior change
- the artifact comparison differs beyond the listed CSS rules
- the structure capture needs a Journey the Navigator has not named

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
