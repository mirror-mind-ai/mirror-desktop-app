[< Story](index.md)

# Test Guide — CV1.DS2.US3 Model and thinking

## Automated Validation

From the repository root, the gate:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Then the story's own tests. The desktop project is also shuffled three
times, since the shell tests share the fake host and the harness's
ambient state:

```bash
npx vitest run packages/protocol --project node
npx vitest run packages/host/src/modelChoice.test.ts packages/host/src/turnControl.test.ts --project node
npx vitest run apps/desktop/src/conversations --project desktop
npx vitest run apps/desktop/src/shell/ModelAndThinking.test.tsx apps/desktop/src/shell/SessionsList.test.tsx apps/desktop/src/shell/Conversation.test.tsx --project desktop
npx vitest run apps/desktop/src/host apps/desktop/src/testing/fakeHost.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

The host changes how it drives Pi: it opens a session on a choice and
changes the model of an open session. So the gate also runs one real turn
with a choice. It runs on the Journey the Navigator names, and only then,
since it writes to their Mirror:

```bash
npm run turn --workspace packages/host -- --journey <slug> --model anthropic/claude-haiku-4-5 --thinking low --prompt "Reply with the single word: pong"
```

The slice that declares `pi-ai` also runs the bundle once and launches
the built app, since staging installs the host's declared dependencies:

```bash
npm run bundle --workspace apps/desktop
```

Expected: every run green, with no `console.error` and no violation. The
real turn answers, prints `anthropic/claude-haiku-4-5` and `low` from the
open's answer and again from the file's last `model_change` and
`thinking_level_change`, and `mirror conversations` shows it logged on
the Journey. The built app launches and reaches its sidebar.

What the tests prove:

- **The protocol.** The schemas accept the levels on a model, the
  defaults on a list, a file's own values on a read, the choice on an
  open, and a configure with its answer. They refuse a configure that
  changes nothing and an answer without a level.
- **The host's rules.** It resolves a new session's start and a resumed
  file's start the way Pi 1.4.0 does, in every branch of that rule:
  - the settings' default, usable or not;
  - a per-model level over the default, on the new-session path only;
  - the clamp both ways;
  - a branch's last model from a `model_change` or a later assistant
    message, usable or not; a recorded level, present or absent; a branch
    with no messages.

  A parity test runs the same cases through Pi's own `createAgentSession`
  over a temp agent dir, so the reproduction is checked against Pi, not
  against the plan's reading of it. The clamp the host and the UI share
  is pinned to `pi-ai`'s over every model and level. `applyChoice` sets
  the model, then the level unconditionally, so a stub whose `setModel`
  moves the level by Pi's switch rule still ends on the wanted one; never
  persisting; a throw wrapped. A change is ordered before a prompt sent
  after it, and a refused change does not block the next prompt. A list
  read leaves the settings files byte-identical.
- **The fake host.** It answers the defaults and a file's own values,
  takes a choice at open and on configure, refuses an unlisted model, and
  says Pi's fallback line where a resumed file's model is not listed. It
  records a request for a level the model does not list, or a change
  without its pair, as a violation, holds a change when told to, and its
  disk keeps what each session was left on.
- **The store.** It shows each source of the header's value in its turn,
  drops a pick on a look, carries it on the first send and replaces it
  with the answer, keeps it on a refused open. It sends a change on the
  open session while idle or running, by session id, refuses a second
  pick while one is in flight, keeps the session's values on a refusal,
  and writes a read's values only for the latest look.
- **The header.** The model list opens on a filter field that narrows it
  by every word typed and picks among what is left by the keys. Its two
  lists show the models with the default marked,
  and only the model's levels, with Pi's descriptions and the default
  tag. A held pick is drawn as held and sends nothing before the first
  send. A moved level is said. The controls are placeholders while the
  first read is pending, busy while a change is in flight, and open with
  disabled options while the session opens. Escape with a list open never
  stops a turn.

What they cannot prove: Pi's actual answer on the chosen model and level;
that the file records a change so `pi -r` resumes on it; that a change
during a run reaches Pi's next request and leaves the run intact; that
the header fits at the window's minimum width, since happy-dom applies no
CSS; and, if the parity test cannot run hermetically, that the host's
reproduction of Pi's start rule agrees with what Pi opens. Those are the
real turn's and the Navigator's route.

## E2E Decision

Required. The fake host proves every path in the UI and the stubs prove
the host's rules. Only the window with Pi proves four things:

- the chosen model and level are what Pi answers on;
- the session file records them, so terminal Pi resumes on them;
- a change during a run is taken at Pi's next step;
- the header's defaults and a file's own values match what Pi opens.

## Navigator Validation

The route is in [plan.md](plan.md#validation-route). It has eleven steps
in the window, on the Journey the Navigator names. Each session file's
last `model_change` and `thinking_level_change`, read with `grep` and
never by resuming a session the app holds open, are the witness of what
it records; `pi -r` is run once, after the app is quit. Both of Pi's
settings files are copied before step 1 and diffed at step 11, as the
witness that the app wrote nothing to them. Step 2 checks the header at
the window's minimum width. Each step has its expected observation, and
the pass and fail conditions are beneath the table.

Consciously left out, and proven against the fake host and the stubs
only:

- a model Pi refuses, at open or on the open session;
- Pi's settings naming no usable default;
- a file whose model Pi cannot restore, and Pi's fallback line;
- a model without reasoning, since all of the Navigator's models reason;
- a change and a prompt sent at once;
- a cross-provider model change during a run.

## Validation Evidence

Automated, on `364abad`, 2026-11-07:

- `npm run typecheck` clean; `npm test` 504 passed in 45 files, no
  unhandled error; `npm run build`; `git diff --check` clean.
- The story's runs: protocol 28; the host's rules and turn control 45;
  the conversations 101; the header, the sessions list and the
  conversation 34; the host store and the fake host 84. The desktop
  project shuffled with seeds 1, 2 and 3: 402 passed each.
- The parity test ran Pi's own `createAgentSession` over every branch of
  the start rule, new and resumed, hermetically; the clamp agreed with
  `pi-ai`'s over all 1,599 models Pi knows at every level.
- Seven mutations, each caught: the level set only when it differs from
  the level before `setModel`, which lets Pi's switch rule win (two tests);
  a resumed file with no level taking the model's own setting; a change
  and a prompt no longer in order; the held pick not carried on the open;
  a look keeping the pick of the session it left; a list that does not
  take Escape first; `session.open` taking a model without its level.
- The bundle staged `pi-ai` 1.4.0 beside `pi-coding-agent` 1.4.0; the
  built app launched, its embedded host ran, and both quit with no
  orphan.
- The real host, started alone and asked only reads: it refused a 0.6.0
  client and accepted 0.7.0; `sessions.list` for `mirror-desktop`
  answered `anthropic/claude-sonnet-5-5` at `medium`, the Navigator's
  settings; `session.transcript` for its newest session answered
  `anthropic/claude-fable-5` at `max`, the file's own last entries.
  `~/.pi/agent/settings.json` was byte-identical before and after.
- Found there: the host offers **426** models, not the 25 the plan read
  from Pi standalone. The host loads Mirror's configuration, whose
  `OPENROUTER_API_KEY` signs OpenRouter in with 401 models, beside
  Anthropic's 17 and OpenAI Codex's 8. The plan's Non-Goal of a search in
  the model list rested on twenty-five rows; a decision for the Navigator
  before the route.

Ruled: (a), a filter in the model list. Built, with its tests and one
more mutation caught (a filter that keeps every model); the gate again:
508 passed in 45 files, the desktop project 406 passed under each of
seeds 1 to 3, the build, `git diff --check`.

The real turn, on `automation`, the Journey the Navigator named, with
`--model anthropic/claude-haiku-4-5 --thinking low`: the open answered
`anthropic/claude-haiku-4-5, thinking low`, the answer was "pong", and
after the close the session file's last entries read
`anthropic/claude-haiku-4-5, thinking low`; `mirror conversations` lists
it on `automation` (`82b16b29`, 2 messages).

Pending: the Navigator's route, on `automation`.
