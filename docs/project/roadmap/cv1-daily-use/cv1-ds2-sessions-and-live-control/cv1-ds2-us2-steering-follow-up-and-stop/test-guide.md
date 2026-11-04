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
npx vitest run apps/desktop/src/shell/Composer.test.tsx apps/desktop/src/shell/Conversation.test.tsx apps/desktop/src/transcript/Transcript.test.tsx --project desktop
npx vitest run apps/desktop/src/testing/fakeHost.test.ts apps/desktop/src/testing/turns.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

The host changes how it drives Pi (a prompt accepted through Pi's
preflight, a stop that clears the queue first), so the gate also runs one
real turn, on the Journey the Navigator names and only then, since it
writes to their Mirror:

```bash
npm run turn --workspace packages/host -- --journey <slug> --prompt "Reply with the single word: pong"
```

Expected: every run green; no `console.error`, no violation; the real turn
answers and `mirror conversations` shows it logged on the Journey.

What the tests prove, and what they cannot: that the schemas accept the
behavior, the four dispositions, the withdrawn lists and the new code, and
refuse their absence where required; that the host's turn control answers
each disposition from Pi's preflight, `deferred` when the call resolves
first, refuses in the host's words what it can check before Pi and a busy
session without a behavior, hands a rejection after preflight to the
event, clears the queue before and after it aborts, keeps a steer queued
between the two, and leaves out a message Pi delivered between the first
clear and idle; that the fake host queues (the `queue_update` before the
answer, as Pi), delivers by first occurrence, refuses an unscripted
delivery and a queue left at a settle, plays a stop with the text streamed
so far and an open tool ended in error, records on its disk what played,
runs the content net over queued text, and refuses a `queue_update` in a
fixture; that the store swallows exactly one echo for its own prompt,
whichever side of the answer it lands, and draws every other delivered
message with Pi's text, keeps the queue from `queue_update` alone, sets
`running` from `agent_start`, lists what is sending, returns a withdrawn,
refused or orphaned message to the draft once by the merge rule, and
leaves `handled` to the events; and that the composer's keys and buttons
send what they say, the queue and its Stop line are shown, a delivery
enters the transcript where it was taken, a stop marks the answer and
returns focus. They cannot prove the order in which a real host's answer
and Pi's events reach the socket (the stub stages both orders; the fake
host plays one), that the withdrawn-and-delivered window is closed by the
host's subtraction in a real run, where Pi delivers a steer or a follow-up,
that the second clear leaves nothing for the next turn, that Option+Enter
arrives as Alt+Enter in the webview, or that Mirror's logger leaves a
stopped run's conversation open and logs a steered run as one turn: those
are the Navigator's route. The `started` race is provable only against
the stub: with the fake host, "answering" is a held turn with events left,
so the UI cannot be running while the fake host is idle.

## E2E Decision

Required. The fake host proves every path in the UI and the stub proves
the host's turn control, but only the window with Pi proves the delivery
points of a steer and a follow-up, the key reaching the webview, the
cleared queue staying clear for the next turn, and Mirror's conversation
surviving a stop and counting a steered run as one turn.

## Navigator Validation

The route is in [plan.md](plan.md#validation-route): ten steps in the
window on the Journey the Navigator names, with terminal Pi and
`mirror conversations` as witnesses (read once after step 1 as the
baseline), each with its expected observation, and the pass and fail
conditions beneath the table. Consciously left out: a run that fails with
a follow-up queued; the connection lost with messages queued; a refusal
in the host's words and a `handled` command, which a signed-in session
with no extension commands cannot stage; and the stop's two race windows,
which only the stub can stage. All are proven against the fake host and
the stub connection only.

## Validation Evidence

Pending implementation and validation.
