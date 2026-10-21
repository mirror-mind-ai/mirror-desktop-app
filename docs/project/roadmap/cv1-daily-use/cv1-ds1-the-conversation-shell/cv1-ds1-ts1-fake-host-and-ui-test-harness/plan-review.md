[< Story](index.md)

# Plan Review — CV1.DS1.TS1

**Date:** 2026-10-21
**Reviewed:** the first version of the plan (commit `1daed73`) and its test guide.
**Outcome:** the plan was revised; the current version is [plan.md](plan.md).

## How it was reviewed

Four lenses were chosen for what this plan puts at risk:

- **quality-assurance**, because the plan is a test strategy;
- **engineer**, for the doubles and the seams;
- **devops-engineer**, because the E2E waiver rests on the shipped artifact;
- **security-engineer**, for a dependency that renders content, the host
  token, the privileged IPC door and what fixtures may contain.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity, no
tools, no session, nothing logged to Mirror). Each saw only the plan, the test
guide and the code they depend on. A separate synthesis pass deduplicated the
findings, reassigned the ones that drifted to their owning lens, and surfaced
the conflicts as decisions. The method is adapted from the
`plan-and-review-parallel` extension, narrowed to four lenses.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision.

| Decision | Ruling |
|---|---|
| D1 — stream observability | Held turns: the test releases a turn's events, so the proof test sees partial text, Stop while running and Send after settling |
| D2 — real turn or invented content | The event structure is captured from one real turn, on a Journey the Navigator names; no content is committed |
| D3 — StrictMode lifecycle | Not pinned in the proof test; per-request-type assertions, with fan-out and exact matching catching the doubled-answer bug |
| D4 — test boundary | By workspace: every `apps/desktop` test runs in happy-dom with the harness, and packages run in node |
| D5 — CSS artifact | Tailwind stops scanning test sources (`@source not` in `app.css`). The rule becomes "no production behavior changes", and the waiver rests on artifact identity |
| D6 — failure verbosity | The traffic log is printed on failure, with enforced invented-content rules |

## Trimmed by the Driver

- **Determinism evidence:** one shuffled run and 20 consecutive runs, without
  runs under CPU load.
- **The artifact check:** the build comparison replaces the grep, its
  sentinel and its positive control.
- **The content rules:** no allowlist until one is needed.
- **The cold-start endpoint path:** deferred to CV1.DS2.TS1, Lifecycle
  hygiene.

## The synthesis, as produced

### 1) SYNTHESIS

The seam is right. Replacing exactly the two doors (`host_endpoint` and the WebSocket) and driving the real `App` and `HostClient` is sound. What the plan lacks is the mechanism behind its guarantees:
- The console swallows errors, so checks that throw never fail a test.
- The fake leaves out the host behaviors the proof test claims to exercise: fan-out, handshake, session state, the exact endpoint, and a strict IPC door.
- The proof test, two Navigator steps and the dist grep cannot fail, or have never been shown to fail.

Risk concentrates in four places: the violation mechanism and teardown, the fidelity of the doubles, the oracle, and the artifact evidence under the E2E waiver. On the last, Tailwind's file scanning means "no production code changes" does not imply an unchanged artifact. Proceeding requires these mechanisms written into the plan, plus Navigator rulings on six decisions; several of them collide with the plan's Non-Goals or its no-production-change rule.

### 2) DISSENT

Raw findings are cited as qa#/eng#/ops#/sec#, numbered in the order each reviewer listed them.

#### ◇ quality-assurance

**QA1 · Two acceptance criteria cannot be observed when the turn plays back whole** (qa#2).
- "The whole streamed answer" and "Send is available again" both need a view of the UI mid-turn.
- Four broken UIs leave the same final DOM:
  - one that renders only `message_end.text`;
  - one that never sets `busy`;
  - one that clears `busy` on the `session.prompt` response;
  - one that clears `busy` on `message_end`.
- `findByRole("button", { name: "Send" })` also finds a disabled button.
- "Available" is ambiguous. After a send, `draft` is `""`, so the correct console shows Send *disabled*.

→ The Navigator chooses between a release gate and final-state-only criteria (D1). Either way, define "available" observably, e.g. Send is shown again and becomes enabled once a draft is typed.

**QA2 · The proof test's oracle is not fixed, and the test has never been seen red** (qa#6, eng#8; the oracle parts of qa#1, qa#5 and eng#5).
- It characterizes code that already works, so its first run is green.
- With one delta, the append branch of `reduceRows` never runs.
- A typed-in expectation can drift from the fixture.
- Regex or `exact:false` matching, and "contains" request checks, pass on doubled output.

→
- The fixture has at least three `text_delta`s, with one boundary on whitespace or a newline. The answer shares no words with the prompt or the session header.
- The expected text is derived from the assistant's `message_end.text` and matched exactly. The prompt node precedes the answer node.
- Exactly one `session.open`, deep-equal to `{ type, journey: <scripted id> }`.
- Exactly one `session.prompt`, deep-equal to `{ type, sessionId: <id the fake returned>, text: "Hello" }`.
- Record these red runs in the evidence:
  - `reduceRows` replacing text instead of appending;
  - `agent_settled` dropped from the fixture, or no longer clearing `busy`;
  - the `if (cancelled)` branch removed;
  - every event delivered twice;
  - a different Journey sent, or expected.

**QA3 · Each event is checked, but not the sequence** (qa#7).
- `projectEvent` maps one event at a time; the order comes from Pi.
- A real turn carries the user's own `message_start`/`message_end`. It closes with `message_end(assistant)`, `agent_end`, `agent_settled`.
- A hand-written list can drop the user events, misplace deltas, or omit `agent_settled` (which then fails as a timeout, not by name). Its `message_end.text` can also contradict the deltas.

→
- Loader invariants, each failing by file and index:
  - the turn opens with `agent_start` and closes with `agent_settled`;
  - deltas sit inside an assistant message;
  - `message_end.text` equals the concatenated deltas.
- Use the host's `session.prompt` handling to fix where the response falls relative to the first event.
- Bind the user text to the prompt (ENG6).
- Whether to ground the fixture in a captured real turn is contested (D2).

**QA4 · The outbound check is untested, and the Approach overclaims** (qa#8).
- The client drops invalid host messages silently (`if (!parsed.success) return;`).
- So a mis-typed world hangs on "Loading Journeys from Mirror…" and names nothing. Examples: a Journey without `description`, a model without `reasoning`, an identity without `instanceId`.

→
- Validate the world at install against `HostIdentity`, `AvailableModel` and `Journey`, naming the field.
- Keep the per-message `HostMessage` check.
- Self-test both: the world case names the field; the outgoing-message case names the type and request id.
- Restate the Approach as covering correlation, hello and success-path parsing only.
- Stop resting the E2E waiver on client validation.

**QA5 · The harness's own suite can be green while its promise is missing** (the scenario part of qa#3).
→ In the UI environment (ENG9), add cases for:
- a swallowed `fetch(...).catch(() => {})`;
- a request rejection the UI toasts;
- a request sent during unmount;
- an assertion that the guard and the teardown verification are installed.

**QA6 · Cold start is a seam nobody owns** (qa#4).
- When `host_endpoint` returns `null`, `hostEndpoint()` calls `listen("host-ready")`. That path is neither tested nor guarded.
- Under a permissive mock the UI sits at "connecting to host…" until a timeout that names nothing.

→ List it in Non-Goals as a consciously deferred seam, with a named owning story.

**QA7 · Navigator steps 2 and 4 cannot tell a working harness from a broken one** (qa#11; the validation part of ops#5).
- Step 2 (Wi-Fi off) stays green in three cases: the guard works, nothing reaches out, or an attempt is made and swallowed.
- Loopback stays up offline.
- The whole-suite run can fail on an unrelated node test.
- Step 4 is a matter of taste, and it contradicts the Given. With zero models the console shows SignIn, while a default model hides a precondition US3 would have to override.
- Only the fixture property has a deliberate negative step.

→
- Replace step 2 with deliberate violations, each run and then reverted, each failing by name:
  - a `fetch("https://example.com")`;
  - an XHR;
  - removing the scripted turn.
- Scope any offline claim to the UI project.
- Make step 4 checkable:
  - the test imports only the harness, Testing Library and protocol types;
  - no socket, port or token appears in it;
  - the world names its Journey, model and fixture;
  - queries are by role or text.

**QA8 · Determinism and isolation have no evidence** (qa#12; the next-test case of eng#3).
- One green run of one UI test cannot expose teardown leaks, because a leak reaches only a *next* test.
- Late updates surface only as an `act()` `console.error`.
- RTL's default 1000 ms `findBy*` timeout over a multi-hop chain is a latent flake.

→
- Add a second test in the same file that ends right after sending. It proves a still-playing turn delivers nothing to the next test.
- Pass both orders under `--sequence.shuffle` with fixed seeds.
- Loop the tests about 50 times, some runs under CPU load, and record the result.
- Fail any test that logs an unexpected `console.error`.

#### ◇ engineer

**ENG1 · Violations are recorded, not thrown** (eng#1; the mechanism part of qa#3).
- Every path where a check fires toasts or discards errors: `openSession`, `send`, the connect chain (silently when `cancelled`), and `abort().catch(() => undefined)`.
- "Fails when the test ends" names no mechanism.
- A self-test that triggers a violation on purpose cannot assert its own failure.

→
- One `testing/violations.ts`, fed by the fake host, the guard and the IPC mock with the full request, URL or command.
- `verify()` throws one message listing every violation.
- A draining `take()` lets self-tests assert `expect(() => verify()).toThrow(/…/)`.
- Scripted turns that were never played also fail (qa#3). The rule must define "played", because QA8's test ends mid-turn on purpose.

**ENG2 · One owner for global state, one teardown order** (eng#3; the hook-order part of qa#3).
- The guard and the fake host both stub `WebSocket`; the last one wins.
- `vi.unstubAllGlobals()` removes the guard mid-unmount.
- RTL's auto-cleanup is not registered under `globals: false`.
- Queued frames reach the next test.
- `mockIPC` state lingers until cleared.
- With stack-ordered hooks, verification can run before unmount, so requests sent during unmount escape.

→
- The UI setup owns every global the harness touches: `WebSocket`, `fetch` and the other doors, and the IPC mock.
- The fake host registers through `serve(endpoint, host)` instead of stubbing.
- One `afterEach`, in this order: `cleanup()` → cancel pending frames → `verify()` → `clearMocks()` → `vi.unstubAllGlobals()`.

**ENG3 · The socket double must be faithful where `HostClient` depends on it** (eng#4).
- An `open` dispatched in the constructor is never heard.
- Passing objects skips `JSON.stringify`/`JSON.parse`.
- Answering inside `send()`, or delivering a whole turn as one batch, are timings no real socket produces.
- Delivering after `close()` contradicts StrictMode's close.

→ `testing/fakeSocket.ts`, declared `extends EventTarget implements WebSocket`, with one test per rule:
- `open` fires in a later macrotask;
- `send` accepts strings only and throws `InvalidStateError` while CONNECTING;
- the fake host parses each frame;
- host frames arrive as `MessageEvent`s with string `data`, one per macrotask;
- `close()` goes CLOSING → CLOSED, dispatches `close` asynchronously, and the host forgets the connection.

**ENG4 · Fan-out must match the real host** (qa#1, eng#5).
- `server.ts` pushes events to every socket in `authenticatedSockets`. That is why StrictMode once rendered `**4**4****`.
- A fake that streams only to the prompting socket lets a deleted `if (cancelled)` pass.

→ Deliver session events to every open connection that completed `hello`, and stop at `close()`. Pin both with harness tests. The oracle side is QA2; the lifecycle assertion is D3.

**ENG5 · The handshake is not enforced** (eng#7; the hello-order part of qa#5; the token part is under SEC2).
- A fake that accepts any `hello` proves only that one was sent.

→
- A request before `hello` gets `unauthorized`.
- A wrong `protocolVersion` gets `unsupported_protocol_version`.
- Each is also recorded as a violation.
- A comment names `server.ts` as the source of truth.
- One self-test per rule.

**ENG6 · "Scripted" and session state are undefined** (eng#6; the session and Journey part of qa#5; IPC is under SEC3).
- "Unscripted" can mean an unimplemented type, or a request the world cannot answer.
- The fake plays along with schema-valid impossibilities: a prompt to a stale or foreign `sessionId`, or an open for an unknown Journey or one without `projectPath`.
- `applyEvent` ignores `event.sessionId`.
- Positional turns hide that the fixture's user message assumes "Hello".
- Ids minted from `randomUUID`/`Date.now` rule out exact assertions.

→
- State the rule. In TS1, each of these is a violation:
  - an unimplemented type;
  - an unknown Journey or session;
  - a prompt with no turn left;
  - a prompt that does not match the next turn.
- Error answers that mimic the host arrive with the story that needs them.
- Track the opened sessions and the scripted Journeys.
- Stamp events with the prompting session's id.
- Declare turns as `{ prompt: "Hello", events: loadTurn("streamed-answer") }`.
- Derive ids and `at` from the world (`session-1`, a fixed clock).
- Self-test an unknown `sessionId`, and a second prompt with no turn left.

**ENG7 · How fixtures load decides whether failures can name them** (eng#10).
- A static JSON import loses the file name.
- Combining I/O and validation forces a real broken file into `fixtures/`.
- Eager validation fails every UI file at collection.

→ `testing/turns.ts` holds:
- a pure `parseTurn(name, data)` over `z.array(SessionEvent)` that throws `"<name>: event <index> (<type>): <issue>"`, tested with inline data;
- `loadTurn(name)`, which takes the name from the path via `import.meta.glob("./fixtures/*.json")` and validates on use;
- one test that sweeps every fixture.

**ENG8 · The guard closes too few doors** (eng#11; the door and loopback parts of qa#4 and ops#5).
- Under happy-dom, `fetch` and `XMLHttpRequest` do real HTTP through Node.
- Node 24 has a global `WebSocket`.
- A desktop `.test.ts` that calls `HostClient.connect` runs unguarded in node and can reach a live loopback process.

→
- Guard `fetch`, `XMLHttpRequest`, `WebSocket` (fake endpoint only, per SEC2), `EventSource`, `navigator.sendBeacon`, and Node-level socket connects.
- Use happy-dom's fetch interceptor where the pinned major has one.
- Fail closed past the guard: set `happyDOM.url` to `"http://mirror.invalid/"` and put the fake endpoint on port 0.
- Guard the desktop tests left in node (D4).
- One happy-dom test per door.
- Resource-loading settings are under SEC4.

**ENG9 · Choose each test's environment by what it needs, not by its file extension** (eng#2; the runtime parts of qa#3, qa#4 and ops#5).
- Under scope item 1, `fakeHost.test.ts` runs in node. There `mockIPC` throws for lack of `window`, and neither the setup nor verification runs. The harness then proves rules that UI tests don't run under.
- `.ts` tests that need a DOM get renamed `.tsx`.
- The root config never loads `apps/desktop/vite.config.ts`, so tests and build resolve modules differently.

→
- Use `test.projects`, with a desktop project that `mergeConfig`s `vite.config.ts` and adds happy-dom and the UI setup.
- The harness tests run there.
- List the existing desktop tests that change environment; opt the true node ones out with `// @vitest-environment node`.
- The boundary itself is contested (D4).

**ENG10 · Split the harness, and enforce dependency direction by structure** (eng#12; the dist sentinel is under OPS1).
- As scoped, `fakeHost.ts` holds a socket double, the IPC mock, a protocol server, playback and recording.
- `fakeHost.test.ts` tests a guard whose only home is a setup that registers hooks on import.

→
- Split into `fakeSocket.ts`, `fakeHost.ts`, `turns.ts`, `networkGuard.ts`, `violations.ts` and `renderApp.tsx`, each tested where it has logic.
- `setup.ts` only wires them together.
- A desktop test reads the non-test sources (`import.meta.glob(…, { query: "?raw" })`) and fails, naming the import, on any import of `testing/` or `@testing-library`.

**ENG11 · One composition root** (eng#13).
- Hand-copied `<StrictMode><App /></StrictMode>` trees drift once US1 adds providers to `main.tsx`.

→
- `testing/renderApp.tsx` is the only place tests compose the app, with a comment saying it mirrors `main.tsx`.
- A US1 follow-up extracts the root component that both mount.

**ENG12 · The conventions must say how to act, not only how to find** (eng#9; the stale-line part of ops#4).
- `fireEvent` ignores `disabled`, so a submit still sends past a disabled Send.
- It performs none of the keystroke default actions US3 needs.

→
- Add `@testing-library/user-event`. This amends scope item 6.
- In AGENTS.md:
  - act through `userEvent.setup()`;
  - wait with `findBy*`/`waitFor`, never fixed delays;
  - find elements by role, label or text.
- Fix the AGENTS.md lines that still say `*.test.ts` (the tests-beside-the-code line and the Commands line).
- Fix the `vitest.config.ts` comment "the desktop app adds React component tests later".

#### ◇ devops-engineer

**OPS1 · The artifact check cannot fail, and it inspects the wrong artifact** (ops#1, qa#10; the sentinel part of eng#12).
- Minification removes the phrase, so the grep passes either way.
- `tsc --noEmit && vite build` leaves a stale `dist` when `tsc` fails, and the separate grep still prints success.
- Two leak paths go unchecked:
  - `@tauri-apps/api/mocks`, or a harness module, becoming reachable from `main.tsx`;
  - the staged host, which carries `packages/protocol` (the package AGENTS.md says "also backs the fake host").
- Lockfile rewrites can move production dependencies with no source change.

→
- Build the base commit and the story commit, each in a sibling `git worktree` after `npm ci` and `rm -rf dist`. Diff their sha256 manifests and require an empty diff, masking any stamps. Alternatively, check sourcemap `sources` for `src/testing/`, `@tauri-apps/api/mocks`, `happy-dom` and `@testing-library`.
- Check production-dependency identity with the `jq` filter over the lockfile's non-dev entries.
- Chain every artifact command with `&&`.
- Give the harness a runtime sentinel. Grep for it and for `mockIPC`, and prove the grep once with a scratch build that imports the harness from `main.tsx`.
- In AGENTS.md: harness code and fixtures live only under `apps/desktop/src/testing/`, never in a staged package.

**OPS2 · Tailwind turns test files into production CSS** (ops#2; the CSS part of qa#10).
- Tailwind v4 scans every non-ignored file under `apps/desktop`.
- Tokens such as `static`, `container`, `hidden`, `table` and `block` in tests and fixtures emit CSS rules and change the CSS hash.
- A commit that only touches a fixture changes the release CSS.

→ Add `@source not "../testing"`, `"../**/*.test.ts"` and `"../**/*.test.tsx"` to `src/styles/app.css`. This needs Tailwind ≥ 4.1, so confirm the lockfile's version. Because `app.css` is production code, raise it as `plan_rule_conflict` (D5).

**OPS3 · Nothing validates the committed state** (ops#3).
- Every check runs on the working tree.
- Selective staging can leave behind the setup file, the fixture, `vitest.config.ts` or `package-lock.json`, with no local symptom.
- A fresh checkout resolves happy-dom anew, across its breaking majors.
- CI is out of scope.

→
- Name the lockfile and every new or modified file as story-scoped.
- After committing, run `npm ci && npm test && npm run build` in `git worktree add ../mirror-desktop-ts1-check HEAD`, then `git worktree remove` it. OPS1's story build can double as this.

**OPS4 · Configuration traps drop tests silently** (ops#4, qa#9).
- `environmentMatchGlobs` keeps `setupFiles` global, so the guard would load into the host's loopback tests. It is also deprecated in Vitest 3 and removed in 4.
- Inline projects ignore the root `test` options unless `extends: true` is set. With it, the root `include` merges into each project.
- The intuitive "node = packages, UI = apps/desktop" split drops `apps/desktop/src/**/*.test.ts`.
- The current root `include` already matches `.tsx`, so a UI file can be collected twice.
- Running from `apps/desktop` picks up `vite.config.ts` and runs the UI test in node, with no setup or guard.
- An "all green" result shows none of this.

→
- Inline `test.projects` with no root `include`, partitioned globs, and `retry: 0` stated in each project.
- Run `npx vitest list --filesOnly` before and after, and put the comparison in the automated route and the evidence:
  - the node set is identical, file for file;
  - the additions are exactly the new files;
  - each UI file is collected once, under happy-dom.
- In AGENTS.md: run tests from the root (`npm test`, or `npx vitest run <path> --project ui`).

**OPS5 · The likeliest failure names nothing** (ops#6; the buried-names part of qa#3).
- Slips that break no rule read only as "Unable to find an element…" over a truncated DOM dump. Examples: an `open` fired before the listener is attached, or events routed to the closed connection.
- An unanswered unscripted request hangs the UI and buries the violation under the timeout.

→
- Answer unscripted requests immediately with a named harness error, and record them.
- Keep an ordered traffic log:
  - connections opened, hello'd and closed, and by whom;
  - requests and responses;
  - events, with their target connection;
  - blocked network attempts.
- Flag events sent to closed or un-hello'd connections.
- Print the log only on failure, via `onTestFailed` registered from the setup's `beforeEach`.
- Raise `DEBUG_PRINT_LIMIT` for the UI project (D6).
- Document in AGENTS.md where the log appears.

#### ◇ security-engineer

**SEC1 · Fixture and world content has no provenance rule** (sec#1).
- zod strips unknown keys only from the parsed copy; the committed file keeps them.
- `tool_start.args` is `z.unknown()`, and the text fields are free-form.
- The cheap route to realism is pasting `npm run turn` output or a real `journeys.list`. That commits paths, tool output (an `.env`, `auth.json`), and Mirror identity and memory.
- Named failures and DOM dumps then amplify that content into terminals, CI logs and the agent's tool results, which reach the model provider and Pi's session files.

→
- In AGENTS.md, fixtures and worlds are synthetic and inert:
  - invented Journeys;
  - paths under `/Users/test/`;
  - placeholder tokens;
  - no text from a real session or real tool output;
  - reserved domains such as `example.invalid`;
  - a future recorder redacts, and is reviewed as a security change.
- Enforce this at load and at install:
  - reject keys the schema does not describe (compare raw to parsed, naming file, index and key);
  - reject a denylist of shapes: home paths other than the placeholder, `sk-`/`sk-ant-`/`sk-or-`, `ghp_`/`github_pat_`, `AKIA`, JWT shapes, PEM headers.
- Self-test both.

**SEC2 · The token and the endpoint must be exact** (sec#2; the WebSocket-URL parts of qa#4, eng#11 and ops#5; the token parts of eng#7 and qa#5).
- A stub that wires every URL to the fake makes "a socket to anything but the fake host" unreachable in every test that renders the app.
- Each of these would receive the token: `ws://localhost`, `ws://[::1]`, a stale port, or an endpoint taken from a payload or an env var.
- Another local user on `[::1]:<port>`, or on a vacated port, can replay it against the real host.
- `ws://127.0.0.1:${port}` is hardcoded today; US1 moves it.

→
- Accept exactly `ws://127.0.0.1:<port>`, using the port the mocked `host_endpoint` returned.
- Any other URL gets error and close events, as a refused connection would, plus a violation naming the URL.
- The first message must be `hello` with the exact issued token. Otherwise answer `unauthorized`, close with 4401, and record a violation.
- Self-test `ws://localhost:<port>` and a foreign token.
- The proof test asserts that `hello` carried the endpoint's token.

**SEC3 · The IPC door must deny by default** (sec#3; the IPC parts of qa#4 and eng#6).
- A `mockIPC` handler written for `host_endpoint` resolves `plugin:opener|open_url`, `plugin:event|listen` and every future command with `undefined`, and records nothing.
- This is the door where strings from the host or the model become OS actions:
  - the opener plugin is already a dependency;
  - `auth_url` exists to be opened;
  - US2 renders links the model wrote.
- Throwing is not enough, because UI code swallows the rejection.

→
- Answer only scripted commands.
- Record every `invoke` with its arguments, readable beside the socket requests.
- Reject everything else, `plugin:event|*` included unless scripted, with a teardown violation naming the command and its arguments.
- Self-test that a swallowed `plugin:opener|open_url` still fails by name.
- In AGENTS.md: a story that introduces a privileged call scripts it and asserts its arguments.

**SEC4 · happy-dom's posture is unstated, with no version floor** (sec#4; the resource-loading parts of qa#4, eng#11 and ops#5).
- The coding agent launches the Vitest worker unattended. That process holds HOME (`~/.pi/agent/auth.json`, `memory.db`), the provider keys and the filesystem.
- happy-dom releases before 20 evaluate `<script>` in a `vm` context that escapes to `process` (CVE-2025-61927; also CVE-2024-51757 before 15.10.2).
- Default resource loading goes through happy-dom's internal fetch, beneath any `fetch` stub.

→
- Require happy-dom ≥ 20 at its current patch release, and commit the lockfile entry.
- Set `environmentOptions.happyDOM.settings` explicitly:
  - JavaScript evaluation off;
  - JavaScript and CSS file loading off;
  - iframe page loading off;
  - main-frame and child-frame navigation off;
  - file-system requests off.
- Add a canary test that appends a `<script>` setting a global, and fails by name if it ran.
- In AGENTS.md: fixtures and rendered model output are untrusted; UI tests never enable script evaluation; a library that needs it is mocked.

### 3) DECISIONS

**D1 · Proving the stream vs the "no pausing" Non-Goal**
- *QA, option (a)* (qa#2): add a gate that holds the turn's events until the test releases them, then assert:
  - after submit, Stop is shown and Send is absent;
  - after two deltas, partial text is shown;
  - after `message_end`, the full text is shown and Stop remains;
  - after `agent_settled`, Send is back;
  - typing a draft enables Send.

  This is "pausing a turn mid-stream", which the Non-Goals leave to "the story that first needs one."
- *QA, option (b)*, consistent with the Non-Goal: keep whole-turn playback, restate the first criterion as final-state only, and record streaming and busy-state as unproven in TS1, owned by US2 and US3.
- **Navigator decides:** amend the Non-Goal and build the gate, or narrow the acceptance text.

**D2 · Grounding the fixture in a real turn vs synthetic-only content**
- *QA* (qa#7): capture one real projected turn by logging `projectEvent` during `npm run turn`. Base the fixture on it, or diff against it, and record the provenance in the evidence. QA calls this "a one-off capture, not a recorder."
- *Security* (sec#1): no text from a real session or real tool output; anything recorder-like redacts and gets a security review.
- *Plan Non-Goal:* "Recording fixtures from a real turn."
- **Navigator decides:**
  - whether a real capture happens at all;
  - if it does, whether its content may enter the fixture or the committed evidence, or only its event structure is diffed against a synthetic fixture;
  - if it doesn't, whether QA3's loader invariants are the accepted substitute.

**D3 · How much of the StrictMode lifecycle the proof test pins**
- *QA* (qa#1): "exactly" includes one live, authenticated connection after mount, and the other connection having sent `hello` and been closed.
- *Engineer* (eng#5): assert per request type only. Encoding React's double mount and the console's connect sequence breaks when US1 changes both, for reasons unrelated to the claim.
- *Common ground:* fan-out (ENG4) plus exact-text matching (QA2) already turn the doubled-render bug red.
- **Navigator decides:** pin the lifecycle, which also proves the stale connection closes, or keep the test robust to US1's store refactor.

**D4 · Where the desktop test boundary falls (scope item 1)**
- *Engineer* (eng#2): one desktop project. Every `apps/desktop/src/**/*.test.{ts,tsx}` runs in happy-dom with the UI setup, merged with `vite.config.ts`. Existing desktop `.ts` tests change environment unless opted out. This replaces the plan's "every other test keeps running in node."
- *DevOps* (ops#4, ops#5): the `node` project covers `packages/**` and `apps/**/src/**/*.test.ts`; the `ui` project covers `.test.tsx` plus the harness tests. This is closer to the plan's rule. But the desktop node tests keep a real `WebSocket`, need their own guard, and that guard must stay out of the host's loopback tests.
- *QA* (qa#3) accepts either renaming the harness tests to `.tsx` or including `src/testing/**`. The engineer rejects renaming.
- *Agreed by all:* `test.projects`, harness tests in happy-dom, and a collection diff.
- **Navigator decides** the boundary.

**D5 · The CSS artifact, the no-production-change rule, and what the E2E waiver rests on**
- *DevOps* (ops#2): exclude test sources with `@source not` in `src/styles/app.css`. That file is production code, so this is a `plan_rule_conflict`.
- *QA* (qa#10), with DevOps as fallback: accept the CSS delta, document it as inert, and narrow the identity check to "only the CSS asset differs."
- *QA* (qa#10) also holds that differing JS chunks void the waiver and require a real-shell smoke run, which the Non-Goals exclude. qa#8 adds that the waiver leans on client-validation coverage that does not exist.
- **Navigator decides:** exclusion or accepted drift; and whether a failed identity check overrides the Non-Goal on real-shell runs.

**D6 · How much a failing test prints vs how much content it exposes**
- *DevOps* (ops#6): print the full traffic log on failure, and raise `DEBUG_PRINT_LIMIT`.
- *Security* (sec#1): failure output is the channel that carries fixture content into terminals, CI logs, the agent's tool results, the model provider and Pi's session files. Security's control is on the content, not on the output.
- The two coexist only while SEC1's rules are enforced, so the D2 ruling decides it.
- **Navigator decides:** raise verbosity unconditionally, or only together with enforced synthetic-content rules.

### 4) COVERAGE CHECK

Nothing was dropped. The raw findings below were merged or split; all others were kept as single findings.
- qa#1 and eng#5: the same StrictMode fan-out issue. The behavior went to ENG4, the oracle to QA2, and their disagreement to D3.
- qa#3: split by owner. Mechanism → ENG1, hook order → ENG2, runtime → ENG9, buried names → OPS5, scenarios → QA5.
- eng#1: merged with qa#3's mechanism into ENG1.
- eng#3: ENG2; its next-test leak test merged into QA8, since qa#12 proposes the same test.
- qa#4: split. Doors → ENG8, runtime → ENG9, WebSocket URL → SEC2, IPC → SEC3, resource loading → SEC4. Cold start kept as QA6.
- eng#11: doors → ENG8, endpoint → SEC2, happy-dom settings → SEC4.
- ops#5: split. Runtime → ENG9; doors, loopback and fail-closed → ENG8; endpoint → SEC2; settings → SEC4; the Wi-Fi step → QA7.
- qa#5: split. Hello order → ENG5, session and Journey state → ENG6, token → SEC2, assertions → QA2.
- eng#7: order and version → ENG5; token → SEC2.
- eng#6: ENG6; its IPC part duplicates sec#3 and merged into SEC3.
- eng#8: moved to QA2, since the proof test's power to fail is QA's domain; merged with qa#6.
- qa#9: merged into OPS4; it is the same silent-glob trap and collection diff as ops#4.
- ops#4: OPS4; the stale Commands line → ENG12; the overlap with eng#2's project design → D4.
- qa#10: merged into OPS1 (grep, sentinel, positive control) and OPS2 (Tailwind); its waiver fallback → D5.
- eng#12: ENG10; the dist sentinel → OPS1.
- qa#11: QA7, which absorbs ops#5's mutation step.
- ops#6: OPS5, which absorbs qa#3's buried names.

### 5) Before code

Revise the plan and test guide to specify:
- the violation recorder and the teardown order;
- a faithful fake that denies by default: an async socket, fan-out, the handshake, the exact endpoint and token, a strict IPC door, and hardened happy-dom ≥ 20;
- a fixed oracle with recorded red runs;
- the collection-diff, dist-identity and committed-state checks;
- rewritten Navigator steps.

Then get the Navigator's rulings on D1–D6.
