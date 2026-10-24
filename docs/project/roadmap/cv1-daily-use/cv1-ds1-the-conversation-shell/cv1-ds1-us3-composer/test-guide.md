[< Story](index.md)

# Test Guide — CV1.DS1.US3 Composer

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
npx vitest run apps/desktop/src/shell/Conversation.test.tsx --project desktop
npx vitest run apps/desktop/src/host --project desktop
npx vitest run apps/desktop/src/conversations/store.test.ts --project desktop
npx vitest run apps/desktop/src/testing/fakeSocket.test.ts apps/desktop/src/testing/fakeHost.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

Expected: every run green; no `console.error`, no violation. No Rust,
host-package or bundle change is planned, so `cargo check` and a real turn
through the host are not part of this gate unless the implementation
touches them, in which case this guide says so.

What the tests prove, and what they cannot: that Enter sends, not while
composing, and Shift+Enter does not; that Escape, with focus in the text
box or on a sidebar button, sends `session.abort` once for the session on
screen, and nothing when no turn runs or only another Journey's does; that
the running line stands while a held turn runs and is gone when it
settles, and that Enter while running or opening sends nothing; that an
unclean drop from the fake host's side rejects a request in flight by
name, reports the loss, settles a streaming answer with "Connection
lost", leaves no Stop or Send on screen, shows the words once with no
toast, and after a reconnection shows the message back in the draft or
the settled answer; and that a close the UI asked for reports nothing.
The prompt in flight is proven at the client level (a pending request
rejects on a drop) and the store level (a rejected prompt is taken back),
not staged in the UI: the fake socket delivers queued frames before a
close, so the prompt's reply cannot be held. The tests cannot prove that
the webview delivers Escape to the window with focus on a button, that a
host process dying reaches the UI as an unclean close, nor that a dead key
composes: those are the Navigator's, below.

## E2E Decision

Required. The fake host proves every path; only the window proves Escape
through the webview with focus elsewhere, a host process dying seen as an
unclean close, and a dead key composing.

## Navigator Validation

`npm run dev`, on a Journey the Navigator names.

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick a Journey, and without clicking type a line, Shift+Enter, a second line, Enter | Typing lands in the box without a click; the draft showed two lines before Enter; one message with both lines is in the transcript; the composer is empty |
| 2 | Ask for a long answer; while it streams, read under the text box, then type, then press Enter | "Pi is answering. Your draft stays here until it finishes; Escape stops it." stands under the box; Stop is where Send was; what is typed lands in the box and Enter does not send it |
| 3 | Still streaming, press Escape with the cursor in the box | The answer stops where it was, as a click on Stop does today; the line is gone; Send is back with the draft kept |
| 4 | Ask again; while it streams, click "Jump to latest" or a Copy button, then press Escape | Stops the same way: focus outside the box does not matter |
| 5 | With nothing running, press Escape; then hold Escape down during a streaming answer | Nothing changes and the draft stays; the held key stops the answer once, with no error |
| 6 | Ask for a long answer; while it streams, kill the host from a terminal: `pkill -f packages/host/src/main.ts` (in dev the shell runs it as `node …/packages/host/src/main.ts`) | Within a moment the area reads "The host could not be reached", then "The connection to the host was lost." in the mono line with no code or empty parentheses, then "Pi was cut off mid-conversation. Relaunch Mirror Desktop to continue.", and Try again; no Stop, no Send, no toast |
| 7 | Press Try again | "The host could not be reached" with "The host did not accept the connection.", since nothing respawns the host today (plan D6); relaunch the app to continue |
| 8 | Type "é" through a dead key (´ then e) and press Enter while the accent is still pending | Nothing is sent until the composition ends; then Enter sends |

**Pass:** every observation holds. **Fail:** any does not; or Escape
clears the draft; or a send while running goes silently nowhere; or the
dead host leaves the conversation on screen with Stop or Send, or shows
its words twice.

## Validation Evidence

**Automated, 2026-10-25.** `npm run typecheck && npm test && npm run build
&& git diff --check`: green, 270 tests (12 node, 258 desktop, 22 of them
new); the desktop project green under shuffle seeds 1, 2 and 3; the bundle
750 KB (gzip 226.5 KB), 6 KB over US2's, no new chunk. Each rule the story
stands on was broken once by hand and its test failed by name: the
`repeat`, `isComposing` and `defaultPrevented` guards on Escape, each
removed in turn; the lease guard on the close hook; the client's
`closedByUs` flag; the conversations' settling on the loss; and
`lostAfterReady`. Each file was restored.

What changed in tests that existed: the three connection stubs
(`connect.test.ts`, `conversations/store.test.ts`, `journeys/store.test.ts`)
carry `onClose`, since `HostConnection` now picks it. No other test
changed. The composer's own tests are in a new `Composer.test.tsx`;
`Conversation.test.tsx` keeps the conversation's states and gains the host
going away.

Found while building, and settled within the plan: a `role="status"`
region is the one place the composer speaks, so the Enter-while-opening
test reads it empty; the "no toast on a lost connection" rule moved from
the composer's catch into `send()`, where the store test proves it (the
composer's branch could not be reached by a UI test, since the prompt's
reply cannot be held); the sign-in panel keeps its own copy of the rule,
unproven as its flows are (TD-002). The host store's `lostAfterReady` is
what the notice's line reads.

For Debt Review: TD-004 is already written (what a reconnection finds),
and TD-002 extended for `onClose`. `goAway()` settles a held open but not
a held turn: a turn scripted and never prompted is a test's mistake
regardless of the host, so it stays named at teardown.
