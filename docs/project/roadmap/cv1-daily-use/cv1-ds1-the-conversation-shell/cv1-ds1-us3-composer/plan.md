[< Story](index.md)

# Plan — CV1.DS1.US3

## Objective

Settle the composer's keys and make sure nothing in it is ever silently
dead. US1 moved the composer from the spike console with Enter to send,
Shift+Enter for a line break and Stop in Send's place while a turn runs,
and left the rest to this story: Escape, and the composer saying why it
cannot send. This is the last story in CV1.DS1; closing it closes the
Conversation Shell.

Read from the code, not guessed:

- **Enter and Shift+Enter already behave.** `Composer.tsx` prevents the
  default on Enter without Shift and submits; with Shift the textarea
  takes the newline. Enter is tested in `Conversation.test.tsx`;
  Shift+Enter is not tested anywhere. Enter during IME composition
  (`isComposing`) submits today, and macOS dead keys compose.
- **Escape is not wired.** The only way to stop is the Stop button.
  `abort()` in `conversations/store.ts` already sends `session.abort` to
  the right session and swallows a refusal; CV1.DS2.US2 owns what a stop
  does to the turn, and the fake host plays the turn on after an abort.
- **While a turn runs, or a session opens, Enter does nothing, silently.**
  `send()` returns without a word when `running` or `opening`; the
  composer calls it and shows nothing. Stop in Send's place is the only
  sign while running, and it does not say that typing is kept or that
  Enter will not send. While opening, Send is disabled and the transcript
  says "Opening in ~/garden…", but Enter is not disabled.
- **No model and a host that never came up are already said in place**,
  by US1: `Conversation.tsx` shows the sign-in panel instead of the
  transcript and composer while `canUseModels` is false, and `Shell.tsx`
  shows `HostUnreachable`, with the host's words and Try again, while the
  host status is `failed`. The composer is never on screen under either.
- **A host that goes away after it was ready is invisible.** `HostClient`
  listens to the socket's `message` and nothing else. A close rejects
  nothing that waits on it, and the host store never learns of it, so the
  area keeps showing a conversation that can reach nothing. What that
  leaves depends on what was in flight: a `session.open` or a
  `session.prompt` not yet answered waits forever, the message in the
  transcript; and once the prompt is answered, which both hosts do before
  the turn's first event, nothing is pending at all, so a close while an
  answer streams rejects nothing, the partial answer stops, `running`
  stays true, and Stop stands sending an abort nobody answers. A killed
  process sends no close frame: the webview sees code 1006, no reason,
  `wasClean: false`. Tauri spawns and supervises the host but does not
  respawn it (`src-tauri/src/host.rs`), so today a lost host means
  relaunching the app, and Try again fails on connect ("The host did not
  accept the connection."); DS2.TS1 owns a restart that reconnects.
- **The fake socket can close from the host's side** (`fakeSocket.ts`,
  `#closeByHost`, a clean close used by the fake host's unauthorized
  refusal); it cannot drop a connection uncleanly, cannot stop listening,
  and records a violation for a socket to a URL nobody listens on. The
  fake host has no way to drop every connection, and its teardown names a
  held open that was never released.

This is the second version of the plan, revised after a three-lens review
and the Navigator's rulings on R1–R3; see [plan-review.md](plan-review.md).
The Navigator also ruled autofocus in (D10).

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | Where Escape listens | **Anywhere in the window, while the Journey on screen has a running turn.** A hook, `useEscapeToStop`, installs one `keydown` listener on `window` for as long as `running` is true and removes it when the turn settles or the conversation unmounts; Escape calls the same `abort()` as Stop. Hands expect Escape to stop whether focus is in the text box, on a Copy button or on "Jump to latest". The listener ignores `event.repeat` (a held key fires a keydown per repeat, and the abort goes once), `event.isComposing` (an IME cancels with Escape), and `event.defaultPrevented` — the overlay rule: anything closable that handles Escape takes it first, which is how DS2.US3's model and thinking pickers will close without stopping a turn; the composer's header comment records the rule. A press while nothing runs does nothing; it never clears the draft. The Stop button carries `aria-keyshortcuts="Escape"` and a title "Stop (Escape)", a backup: the running line is where the shortcut is read. *Alternative:* the textarea's `onKeyDown` only, which misses focus elsewhere. |
| D2 | What the composer says while a turn runs | **A standing line under the text box**, `text-ui text-muted`, left within the measure, no pulse (the transcript and the sidebar already pulse): "Pi is answering. Your draft stays here until it finishes; Escape stops it." A statement, in the register of US1's lines, naming the thing that is dead (Enter) and what is kept (the draft). It lives in a `role="status"` region that is always mounted and empty when idle, so a live region announces the change. Shown while `running`, gone when the turn settles; Stop stays in Send's place as today; the text box keeps taking typing, since the draft is the person's and CV1.DS2.US2 will send it as a steer or a follow-up. Enter while running stays a no-op: the line already says why. *Alternative:* a toast on each refused Enter, which repeats and is gone before it is read. |
| D3 | The session opening | **Unchanged in what it shows; tested.** Send is disabled and the transcript says "Opening in ~/garden…" (US1); Enter is a no-op and gets the test it lacks. A second line in the composer saying the same thing forty pixels below is not plainer. |
| D4 | No model | **Unchanged.** The sign-in panel in the conversation's place is the plain statement, and the next step, in one; CV2 reworks sign-in. The composer is not on screen, so it cannot lie. |
| D5 | The host gone | **The connection's close is noticed, named, and the area's one notice covers it.** `HostClient` listens to the socket's `close`: every pending request rejects with a `ConnectionLostError` (code `connection_lost`, carrying `wasClean`, the close code and the reason), `failureOf` has a branch for it, and an `onClose` hook fires. The words follow `wasClean`: "The connection to the host was lost." when unclean, as a killed process arrives; "The host closed the connection." when clean; the code and reason appended only when the socket gives them, so no empty parentheses. `connectToHost` sets `onClose` at `hostReady` (before ready, the pending rejection already reports the failure; after, the hook does) to `hostLost(message)`, unless the lease was cancelled, so the UI's own close (StrictMode's first mount, Try again, quitting) reports nothing. The host store records `failed` with the words and that the loss came after ready. The Shell already renders `HostUnreachable` for `failed`: the host's words and Try again, where US1 put them. The composer's and the sign-in panel's catches do not toast a `connection_lost` failure, since the shell says it: one condition, one notice. *Alternative:* a `lost` status that keeps the conversation on screen with the composer saying the host is gone. It keeps the transcript readable, but puts a second "host gone" screen beside US1's, and the moment Try again is pressed the area goes quiet anyway while it reconnects. |
| D6 | What the loss leaves in the conversations | **Settled by what was in flight.** An open in flight: rejected; the conversation is `failed` with the close's words, the message back in the draft, as any failed open (existing path). A prompt in flight: rejected; the message taken back into the draft, no toast (existing `takeBack`, proven at the store level). An answer streaming, nothing pending — **R1, ruled (a):** `connectionLost()` in the conversations store, called from the same close path, settles every running conversation: `running: false`, a notice row after the partial answer, "Connection lost" in the notice tone, "The connection to the host was lost while Pi was answering.", the partial answer kept as it is. No Stop ever points at nothing, and when the Journey is seen again the transcript says why the answer stopped. *(b):* leave `running: true` and write the residue into the ledger for DS2.TS1. Either way, after a reconnection a conversation holds a session the new host does not know, and a failed open holds the old connection's words; that is DS2.TS1's, with the restart that owns it, and goes to the ledger in this story. |
| D7 | The host-gone notice after ready | **R2, ruled (b):** `HostUnreachable` keeps US1's copy and, when the host store says the loss came after ready, adds one line: "Pi was cut off mid-conversation. Relaunch Mirror Desktop to continue." Try again stays: it is not silent (it reports "The host did not accept the connection." by name) and DS2.TS1 makes it work. *(a):* US1's copy unchanged, which says nothing about the conversation that just vanished nor that relaunching is the way out today. *(c):* the `lost` status of D5's alternative. |
| D8 | The fake host | **`goAway()`: an unclean drop, and the port dies with it.** The fake socket gains a host-side `drop()`: queued frames first, then `error`, then `close` with 1006, no reason, `wasClean: false`, as a killed process arrives; and `stopListening(url)`, after which a socket to that URL errors and closes 1006 without recording a violation, as a dead port does. `goAway()` drops every connection, stops listening, and settles held opens so teardown does not name them. A test that reconnects serves a fresh fake host first (the port is fixed; `listen` and `scriptIpc` are replaced), and both hosts' scripts are checked at teardown. The prompt's reply is not holdable and is not made so: the fake socket delivers queued frames before a close, so "prompt in flight" is proven at the client and store levels, not staged in the UI. |
| D9 | Enter during IME composition | **R3, ruled (a):** the Enter handler returns when `isComposing`, one line, tested with a dispatched keydown since user-event cannot compose. *(b):* the ledger. |
| D10 | Focus when a Journey is shown | **The text box takes focus when the conversation mounts**, so picking a Journey and typing is one motion, as in Pi, where the input is the only thing. `autoFocus` on the textarea: the shell keys the conversation by Journey, so every switch mounts a new composer and focuses it; nothing else on the conversation wants focus first. Ruled in by the Navigator; not named by the story. |

## Scope

1. **Shift+Enter, and Enter while composing.** UI tests in
   `Conversation.test.tsx`: type "Hello", Shift+Enter, "there"; the draft
   is `Hello\nthere`, the transcript has nothing, the host received no
   prompt. A keydown Enter with `isComposing` sends nothing (D9). The text
   box has focus once a Journey is picked, and again after a switch (D10).
   The composing guard and `autoFocus` are the only code changes.

2. **Escape stops.** `shell/useEscapeToStop.ts`, used by `Composer.tsx`
   (D1); the Stop button gets `aria-keyshortcuts` and its title. UI tests:
   Escape with focus in the text box sends `session.abort` for the
   session; Escape with focus on a sidebar button sends it too; a repeat
   sends it once; Escape with nothing running sends nothing and keeps the
   draft; Garden running while Beds is on screen, Escape sends nothing.

3. **The running line.** In `Composer.tsx`, the status region of D2;
   tests: the region is empty while idle, carries the line while the held
   turn runs, Enter while it runs sends nothing and keeps the draft, the
   line is gone once the turn settles and Send is back. Enter while the
   open is held: the draft kept, one `session.open`, no prompt (D3).

4. **The fake host goes away** (D8): `drop()` and `stopListening()` in
   `fakeSocket.ts`, each with a test in `fakeSocket.test.ts`; `goAway()` in
   `fakeHost.ts` with its test in `fakeHost.test.ts`, including the held
   open settled.

5. **The host's close, noticed.** In `host/client.ts`: `ConnectionLostError`,
   its `failureOf` branch, a `close` listener that rejects every pending
   request with it and clears the map, then calls `onClose`; `onClose` in
   `HostConnection`'s pick. In `host/store.ts`: `hostLost(message)`, which
   records `failed` and `lostAfterReady`. In `host/connect.ts`: `onClose`
   set at `hostReady`, reporting only while the lease stands and calling
   the conversations store's `connectionLost()` (D6). In
   `conversations/store.ts`: `connectionLost()` and the notice constructor
   beside the other three. In `Composer.tsx` and `SignIn.tsx`: no toast
   for `connection_lost`. In `HostUnreachable.tsx`: the line of D7.
   Tests: a `HostClient` test against the fake socket, that a drop
   rejects a pending request with the named error and fires `onClose`,
   and that a clean close words itself with its code; a `connect.test.ts`
   case that a cancelled lease's close reports nothing, and one that a
   close after ready reports the loss; a store test for `connectionLost()`;
   and in `Conversation.test.tsx`: the host goes away while the held turn
   streams — "The host could not be reached", "The connection to the host
   was lost.", the line of D7, Try again, no Stop and no Send, the words
   once; then a fresh fake host is served, Try again, the Journey shown
   again: the partial answer, the "Connection lost" notice after it, Send
   not Stop, the status region empty; and the host goes away while the
   open is held: after the reconnection the message is back in the draft
   and the conversation says the open failed with the close's words.

6. **The ledger and the docs.** The ledger entry for what a reconnection
   finds (D6), and TD-002's description extended for `onClose`;
   `Composer.tsx`'s header comment says what the composer is now and
   carries the overlay rule; `HostUnreachable.tsx`'s comment names the
   loss after ready. The CV1.DS1 candidate table and this story's index at
   Done; the worklog at Done.

## Non-Goals

- Sending while a turn runs as a steer or a follow-up, the queue, and what
  Stop leaves in the transcript: CV1.DS2.US2.
- Reconnecting on its own, respawning a dead host, and what the
  conversations do with stale sessions after a reconnection: CV1.DS2.TS1
  (D6, ledgered here).
- Changing where or how sign-in is shown when no model can be used (D4).
- A composer line for the session opening (D3).
- Holding the prompt's reply in the fake host (D8).
- A fade on the transition from the transcript to the notice: the line of
  D7 is what tells the person what happened; motion is not this story's.
- A lasting decision on the composer's register and the Escape overlay
  rule: the composer's comment carries both; DS2.US2 and DS2.US3 are the
  first to copy them, and a decision is written then if they hold.
- A history of sent messages, a growing text box, or any other composer
  behavior the story does not name and the Navigator did not rule in
  (autofocus was, D10).
- Attachments by drag and drop.
- Any change to the protocol, the host package or the Rust shell. The
  close is a WebSocket event the UI already receives; no new message is
  needed.

## Acceptance Behavior

```text
Given a Journey picked in the sidebar
When its conversation shows
Then the text box has focus, and typing lands in it with no click

Given a Journey on screen with "Hello" in the composer
When the person presses Enter
Then "Hello" is sent, shows in the transcript, and the composer is empty
And an Enter that arrives while an IME is composing sends nothing

Given a Journey on screen with "Hello" in the composer
When the person presses Shift+Enter and types "there"
Then the draft reads "Hello", a line break, "there", and the host received no prompt

Given a turn running in the Journey on screen
When the person presses Escape, with focus in the text box or on a sidebar button, held down or not
Then the host receives session.abort for that Journey's session, once
And a press of Escape while nothing runs, or while only another Journey runs, sends nothing and keeps the draft

Given a turn running in the Journey on screen
When the person looks under the text box
Then the status line says "Pi is answering. Your draft stays here until it finishes; Escape stops it.", Stop stands where Send was, and typing still lands in the draft
And Enter sends nothing and keeps the draft
And when the turn settles the line is gone and Send is back

Given the session opening for the Journey on screen
When the person presses Enter
Then nothing is sent, the draft is kept, and the transcript still says the session is opening

Given a turn streaming in the Journey on screen
When the host's connection drops
Then the area says "The host could not be reached", "The connection to the host was lost.", "Pi was cut off mid-conversation. Relaunch Mirror Desktop to continue.", and Try again; no Stop and no Send; the words once, no toast
And when the Journey is shown again after a reconnection, the partial answer is there with "Connection lost" after it, Send is back and the status line is empty

Given the session opening for the Journey on screen
When the host's connection drops
Then the area says the host could not be reached, as above
And when the Journey is shown again after a reconnection, the message is back in the draft and the conversation says the open failed with the connection's words

Given the app connected, with a lease it has given up (StrictMode's first mount, Try again, or quitting)
When that connection closes
Then no host failure is reported
```

## Validation Route

Automated, from the repository root: the gate (`npm run typecheck`,
`npm test`, `npm run build`, `git diff --check`), then the story's tests
and the desktop project shuffled three times, as [test-guide.md](test-guide.md)
lists them. No Rust, host-package or bundle change is planned, so `cargo
check` and a real turn through the host are not in the gate; if the
implementation touches either, the guide says so.

Navigator, in the window (`npm run dev`), on a Journey the Navigator names:

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick a Journey, and without clicking type a line, Shift+Enter, a second line, Enter | Typing lands in the box without a click; the draft showed two lines before Enter; one message with both lines is in the transcript; the composer is empty |
| 2 | Ask for a long answer; while it streams, read under the text box, then type, then press Enter | "Pi is answering. Your draft stays here until it finishes; Escape stops it." stands under the box; Stop is where Send was; what is typed lands in the box and Enter does not send it |
| 3 | Still streaming, press Escape with the cursor in the box | The answer stops where it was, as a click on Stop does today; the line is gone; Send is back with the draft kept |
| 4 | Ask again; while it streams, click "Jump to latest" or a Copy button, then press Escape | Stops the same way: focus outside the box does not matter |
| 5 | With nothing running, press Escape; then hold Escape down during a streaming answer | Nothing changes and the draft stays; the held key stops the answer once, with no error |
| 6 | Ask for a long answer; while it streams, kill the host from a terminal: `pkill -f packages/host/src/main.ts` (in dev the shell runs it as `node …/packages/host/src/main.ts`) | Within a moment the area reads "The host could not be reached", then "The connection to the host was lost." in the mono line with no code or empty parentheses, then "Pi was cut off mid-conversation. Relaunch Mirror Desktop to continue.", and Try again; no Stop, no Send, no toast |
| 7 | Press Try again | "The host could not be reached" with "The host did not accept the connection.", since nothing respawns the host today; relaunch the app to continue |
| 8 | Type "é" through a dead key (´ then e) and press Enter while the accent is still pending | Nothing is sent until the composition ends; then Enter sends |

**Pass:** every observation holds. **Fail:** any does not; or Escape
clears the draft; or a send while running goes silently nowhere; or the
dead host leaves the conversation on screen with Stop or Send, or shows
its words twice.

E2E decision: required. The fake host proves every path, but only the
window proves that Escape reaches the composer through the webview with
focus elsewhere, that a dying process is seen as an unclean close, and
that a dead key composes.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.US3`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- No new dependency. No change to `packages/protocol`, `packages/host` or
  `apps/desktop/src-tauri`.
- Slices, each committed green: (1) the Shift+Enter, composing and focus
  tests, with the composing guard and `autoFocus`; (2) Escape and the Stop button's shortcut;
  (3) the running line, and the opening test; (4) the fake socket's
  `drop()` and `stopListening()`, and the fake host's `goAway()`; (5) the
  client's named close, the host store's loss, the connect hook, the
  conversations' `connectionLost()`, the notice, the no-toast rule, the
  notice's line, and the UI tests for the host gone; (6) the ledger, the
  comments and the docs.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- the client's close handling needs the host package or the protocol to
  change (none is expected: the close is the socket's own event)
- a window-level Escape conflicts with another part of the app (none is
  known today; the overlay rule of D1 is how a future one yields)
- the fake socket cannot stage an unclean drop or a refused reconnection
  without recording a violation (D8 names both as harness changes)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval; R1–R3 in
  [plan-review.md](plan-review.md) are ruled.
