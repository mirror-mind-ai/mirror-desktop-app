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

In the window, on the automation Journey (named by the Navigator), with a
second terminal in its project path. Terminal Pi looks at the session only
after the app has quit: Pi has no lock, and a session open in both would
be written by two processes (TD-005).

**Setup.** Terminal 1: `cd ~/dev/workspace/mirror-desktop-app && npm run dev`.
Terminal 2: `cd ~/dev/workspace/automation`. In the window, pick
Automation, open the sessions list in the header and pick "New session".
A new session takes its model and thinking level from Pi's settings
(`claude-sonnet-5-5`, thinking `medium`, since 2026-11-05 19:48); a
resumed one keeps what its file records, as Pi restores it, so the
session the real turn left (`claude-fable-5`, thinking `max`) would
resume with those. After the first send, the header reads
`anthropic/claude-sonnet-5-5` and `thinking medium`.

| Step | Do | Check |
|---|---|---|
| 1 | Send "List the top-level folders of this project one at a time, with a sentence on each, using one tool call per folder" | Send gives way to Steer, Follow up and Stop; the line under the text box reads "Pi is answering. Enter sends before its next step, Option+Enter after it finishes, Escape stops it." |
| 2 | While tool rows still appear, type "One word per folder from here on" and press Enter | The text box empties; above it, "Steering: One word per folder from here on" (after a moment of "Sending: …") and "Stop puts them back in the draft."; when Pi's current step ends, the line goes and the message shows in the transcript as yours, after the tool rows so far; the answers get shorter after it |
| 3 | While it still runs, type "Then say done." and press Option+Enter | "Follow-up: Then say done." above the text box, not a new line in it; after the answer would have ended, it shows as yours and Pi answers "done"; the queue area goes; Send is back |
| 4 | Terminal 2: `mirror conversations --journey automation`, note the top id (X); then `mirror recall X` | One user message with the step 1 prompt (shown twice: the older defect below), no user message for the steer or the follow-up, and one Mirror reply holding the whole answer, "done" included |
| 5 | Send "Write 600 words on tides"; when a paragraph has streamed, press Escape | The text stops where it was, with "Stopped" under it, small and grey; Send is back; the cursor is in the text box; `mirror conversations --journey automation` still has X on top, nothing new |
| 6 | Send "Continue from where you stopped, in one sentence." | A one-sentence answer in the same transcript; X still on top |
| 7 | Send "Write 600 words on rivers"; while it streams type "a" + Enter, "b" + Option+Enter, then "c" without sending; press Escape | Before Escape: "Steering: a" then "Follow-up: b"; after: the text box reads a, blank line, b, blank line, c; the queue area is gone; the answer is marked "Stopped". Then empty the text box and send "Say only: ok": the answer is ok and mentions neither a nor b |
| 8 | Send "Write 600 words on forests" and press Escape before any word appears | Your message, then "Stopped" alone; Send is back |
| 9 | Send "Run sleep 20 and then tell me the time"; press Escape while the bash row is open | The bash row ends as an error, "Stopped" under it; Send is back |
| 10 | Quit the app (Cmd+Q); Terminal 2: `pi -r`, pick the newest session; read it; quit Pi without sending | The steer and the follow-up are where the desktop showed them; neither "a" nor "b" is a message; the stops are there as Pi's "Operation aborted" |
| 11 | Terminal 1: `npm run dev` again; pick Automation | The session shows each stopped answer marked "Stopped" where it was, the empty ones from steps 8 and 9 included, and the steer and follow-up in place |

**Pass:** every check holds. **Fail:** any does not; or a queued message
reaches a later turn after a stop; or a stop ends or replaces the Mirror
conversation (a new id on top); or the steer or the follow-up is logged as
a Mirror user message of its own; or a steer or follow-up shows twice, or
not at all, in the transcript; or Enter while running leaves the draft;
or Option+Enter inserts a line.

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

The real turn, 2026-11-05, on the automation Journey the Navigator named
(`npm run turn --workspace packages/host -- --journey automation --prompt
"Reply with the single word: pong"`): the session opened bound to
automation; the answer `prompt accepted (started)` arrived in the same
millisecond as `agent_start`, 3.8 s after the prompt left, since Pi says
"started" only after Mirror's context step in `before_agent_start`; the
system and custom (Mirror's context) messages Pi echoes came as their own
roles, which the transcript ignores; "pong" answered; the session closed
and the host exited 0; `mirror conversations` shows it as `039b206b` on
automation. A steer typed in a turn's first seconds therefore waits as
"Sending: …" for that long (the stop condition on serialized prompts),
which step 2 of the route can show.

Found by the real turn, older than this story: every prompt sent from the
desktop host is logged twice as a user message in Mirror (`039b206b`
today; US1's `83af4af9` and `ab43069c`, and US3's `7070fc32` before it),
while a prompt sent from terminal Pi into the same conversation is logged
once. Not this story's to fix; it goes to Debt Review as a Change Request.

The Navigator's route, 2026-11-05: walked in the window on the automation
Journey, a new session on Sonnet 5.5 at thinking medium, with `pi -r` and
`mirror recall` as witnesses. Every check of the eleven steps held, and
the Navigator accepted the validation.
