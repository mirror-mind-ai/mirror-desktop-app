[< Story](index.md)

# Test Guide — CV1.DS2.US2 Steering, follow-up and stop

## Automated Validation

From the repository root, the gate:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Then the story's own tests, and the desktop project shuffled three times,
since the shell tests share the fake host and the harness's ambient state:

```bash
npx vitest run packages/protocol --project node
npx vitest run packages/host/src/turnControl.test.ts --project node
npx vitest run apps/desktop/src/conversations --project desktop
npx vitest run apps/desktop/src/shell/Composer.test.tsx apps/desktop/src/transcript/Transcript.test.tsx --project desktop
npx vitest run apps/desktop/src/testing/fakeHost.test.ts apps/desktop/src/testing/turns.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

The host changes how it drives Pi (a prompt accepted through Pi's
preflight, a stop that clears the queue on both sides of the abort), so
the gate also runs one real turn, on the Journey the Navigator names and
only then, since it writes to their Mirror:

```bash
npm run turn --workspace packages/host -- --journey <slug> --prompt "Reply with the single word: pong"
```

Expected: every run green; no `console.error`, no violation; the real turn
prints `prompt accepted (started)` no later than its first events,
answers, and `mirror conversations` shows it logged on the Journey.

What the tests prove, and what they cannot: that the schemas accept the
behavior, the four dispositions, the withdrawn lists and the new code, and
refuse their absence where required; that the host's turn control answers
each disposition from Pi's preflight, `deferred` when the call resolves
first, refuses in the host's words what it can check before Pi and a busy
session without a behavior, hands a rejection after preflight to the
event, clears the queue before and after it aborts, keeps a steer queued
between the two, leaves out a message Pi delivered between the first
clear and the settle, and answers at the stopped run's settle rather than
when a deferred run ends; that the fake host queues (the `queue_update`
before the answer, as Pi), delivers by first occurrence, refuses an
unscripted delivery and a queue left at a settle, plays a stop with the
text streamed so far and an open tool ended in error, records on its disk
what played, runs the content net over queued text, and refuses a
`queue_update` in a fixture; that the store swallows exactly one echo for
its own prompt, whichever side of the answer it lands, and draws every
other delivered message with Pi's text, keeps the queue from
`queue_update` alone, sets running from `agent_start`, lists what is
sending (a deferred message until its echo or its run's end), returns a
withdrawn, refused or orphaned message to the draft once by the merge
rule, and leaves `handled` to Pi's own events; and that the composer's
keys and buttons send what they say, the queue and its Stop line are
shown as text, a delivery enters the transcript where it was taken, a
stop marks the answer and returns focus, and a refusal and a command are
each said once. They cannot prove the order in which a real host's
answer and Pi's events reach the socket (the stub stages both orders; the
fake host plays one), that the host's subtraction closes the
withdrawn-and-delivered window in a real run, where Pi delivers a steer
or a follow-up, that the second clear leaves nothing for the next turn,
that Option+Enter arrives as Alt+Enter in the webview, or that Mirror's
logger leaves a stopped run's conversation open and logs a steered run as
one turn: those are the Navigator's, below. The `started` race is
provable only against the stub: with the fake host, "answering" is a held
turn with events left, so the UI cannot be running while the fake host is
idle.

## E2E Decision

Required. The fake host proves every path in the UI and the stub proves
the host's turn control, but only the window with Pi proves the delivery
points of a steer and a follow-up, the key reaching the webview, the
cleared queue staying clear for the next turn, and Mirror's conversation
surviving a stop and counting a steered run as one turn.

## Navigator Validation

In the window (`npm run dev`), on a Journey the Navigator names (the
automation Journey served US1 and US3), with a terminal open in that
Journey's project path:

| Step | Do | Expected observation |
|---|---|---|
| 1 | Send a prompt that takes several tool calls ("List the top-level folders of this project one at a time, with a sentence on each, using one tool call per folder"); in the terminal, `mirror conversations` | The answer streams with tool rows; Send is replaced by Steer and Follow up, then Stop; the line says Enter sends before its next step, Option+Enter after it finishes, Escape stops it; `mirror conversations` shows the conversation open: this is the baseline |
| 2 | While it runs, type "One word per folder from here on" and press Enter | The draft empties; "Sending: …" for a moment, then "Steering: One word per folder from here on" above the text box with "Stop puts them back in the draft." under it; when the current assistant turn ends, the lines go and the message appears in the transcript as yours, after the tool rows so far; the answer changes course after it |
| 3 | While it still runs, type "Then say done." and press Option+Enter | "Follow-up: Then say done." above the text box; the message is delivered after the answer would have ended, appears as yours, and "done" follows it; the queue area is gone; Send is back |
| 4 | In the terminal, `pi -r` and pick the session; then `mirror conversations` | Both messages are in the transcript where the desktop showed them; the steered turn is one Mirror turn: the same conversation, one more exchange, not three; quit without sending |
| 5 | Send a prompt for a long answer ("Write 600 words on tides"); when a paragraph has streamed, press Escape | The text stops where it was with "Stopped" under it; the queue area is absent; Send is back; the text box has focus; `mirror conversations` shows the same conversation still open, none ended, none new |
| 6 | Send "Continue from where you stopped, in one sentence." | The answer follows in the same session; `mirror conversations` still shows the same conversation |
| 7 | Send another long prompt; while it streams type "a" Enter, "b" Option+Enter, then type "c" without sending; press Escape | The queue shows "Steering: a" then "Follow-up: b"; after Escape the draft reads "a", a blank line, "b", a blank line, "c", the queue area is gone, and the partial answer is marked "Stopped"; neither "a" nor "b" was sent (`pi -r` shows no user message with either), and the next send's answer does not act on them |
| 8 | Send a long prompt and press Escape before the first word streams | The transcript shows your message and an empty answer marked "Stopped"; Send is back |
| 9 | Send a prompt that runs a slow tool ("Run `sleep 20` and then tell me the time"); press Escape while the tool row is open | The tool row ends with an error, an empty answer marked "Stopped" follows it, Send is back |
| 10 | Quit the app, relaunch, pick the Journey | The session read from its file shows the stopped answers marked "Stopped" where they were, and the steered messages in place |

**Pass:** every observation holds. **Fail:** any does not; or a queued
message is delivered into a later turn after a stop; or a stop ends or
replaces the Mirror conversation; or a steered turn shows as more than one
Mirror turn; or a steer or follow-up shows twice, or not at all, in the
transcript; or Enter while running leaves the draft in place; or
Option+Enter inserts a line instead of queueing.

Consciously left out of the window, proven against the fake host and the
stub only: a run that fails with a follow-up queued, which cannot be
provoked on demand against a real provider; the connection lost with
messages queued; a refusal in the host's words and a `handled` command,
since no model, no credential and compaction cannot be staged on a
signed-in session and Mirror registers no command; and the stop's two
race windows, which the stub stages and a hand cannot.

## Validation Evidence

Automated, 2026-11-04, on `e2cb40e` with Pi 1.4.0 and Mirror 0.38.0:

- `npm run typecheck`: clean in every workspace.
- `npm test`: 402 passed in 41 files, no unhandled error.
- The desktop project shuffled with seeds 1, 2 and 3: 338 passed each.
- `npm run build`: built. `git diff --check`: clean.
- Five guards checked by mutation, each caught by its test: the stop
  without its second clear (two tests fail); the stop awaiting `abort()`
  bare instead of racing the stopped run's settle (three fail); Option+Enter
  sent as a steer; focus not returned after a stop; the "Stopped" mark
  removed (two fail).
- The real host, no session opened, nothing written: it boots with the
  new modules under Node's type stripping, and hello reports protocol
  0.6.0 with Pi 1.4.0 and Mirror 0.38.0; a client speaking 0.5.0 is
  refused by name (`unsupported_protocol_version`).

Pending: the real turn on a Journey the Navigator names, and the
Navigator's route.
