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

Expected: every run green, with no `console.error` and no violation. The
real turn answers, prints `anthropic/claude-haiku-4-5` and `low` from the
open's answer, and `mirror conversations` shows it logged on the Journey.

What the tests prove:

- **The protocol.** The schemas accept the levels on a model, the
  defaults on a list, a file's own values on a read, the choice on an
  open, and a configure with its answer. They refuse a configure that
  changes nothing and an answer without a level.
- **The host's rules.** It resolves a new session's start and a resumed
  file's start the way Pi 1.4.0 does, in every branch of that rule:
  - the settings' default, usable or not;
  - a per-model level over the default;
  - the clamp both ways;
  - a recorded model, usable or not, and a recorded level, present or
    absent.

  It applies only what differs, the model before the level, never
  persisting, and it orders a change before a prompt sent after it.
- **The fake host.** It answers the defaults and a file's own values,
  takes a choice at open and on configure, and refuses an unlisted model.
  It records a request for a level the model does not list as a
  violation, and its disk keeps what each session was left on.
- **The store.** It shows each source of the header's value in its turn,
  drops a choice on a look, carries it on the first send and replaces it
  with the answer. It sends a change on the open session while idle or
  running, and keeps the session's values on a refusal.
- **The header.** Its two lists show the models with the default marked,
  and only the model's levels, with Pi's descriptions. A pick sends
  nothing before the first send. Escape with a list open never stops a
  turn. Both controls are disabled while the session opens.

What they cannot prove: Pi's actual answer on the chosen model and level;
that the file records a change so `pi -r` resumes on it; that a change
during a run reaches Pi's next step and leaves the run intact; and that
the host's reproduction of Pi's start rule agrees with what Pi opens.
Those are the real turn's and the Navigator's route.

## E2E Decision

Required. The fake host proves every path in the UI and the stubs prove
the host's rules. Only the window with Pi proves four things:

- the chosen model and level are what Pi answers on;
- the session file records them, so terminal Pi resumes on them;
- a change during a run is taken at Pi's next step;
- the header's defaults and a file's own values match what Pi opens.

## Navigator Validation

The route is in [plan.md](plan.md#validation-route). It has eleven steps
in the window, on the Journey the Navigator names. Terminal Pi's `pi -r`
footer is the witness of what each session file records. Pi's settings
are read before step 1 and again at step 11, as the witness that the app
wrote nothing to them. Each step has its expected observation, and the
pass and fail conditions are beneath the table.

Consciously left out, and proven against the fake host and the stubs
only:

- a model Pi refuses, at open or on the open session;
- Pi's settings naming no usable default;
- a file whose model Pi cannot restore, and Pi's fallback line;
- a model without reasoning, since all of the Navigator's models reason;
- a change and a prompt sent at once.

## Validation Evidence

Pending implementation and validation.
