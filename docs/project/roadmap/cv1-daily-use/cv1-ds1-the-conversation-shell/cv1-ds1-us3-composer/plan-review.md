[< Story](index.md)

# Plan Review — CV1.DS1.US3

**Date:** 2026-10-25
**Reviewed:** the first version of the plan, the story and the test guide, as authored in the Plan step (uncommitted at review time).
**Outcome:** the plan was revised with the fourteen defects below and the Navigator's rulings on R1–R3; the current version is [plan.md](plan.md), approved on 2026-10-25.

## How it was reviewed

Three lenses were chosen for what this plan puts at risk:

- **engineer**, for the client and connect seam the story opens (a close
  that rejects what waits on it, a hook guarded by the lease), the
  lifecycle of a window-level key listener, what the composer owns, and
  the fake host's new verb;
- **quality-assurance**, for whether the tests prove each scenario against
  the fake host as the real failure happens, what a killed process looks
  like from the webview, the harness's teardown rules, and whether the
  route can be judged alone;
- **experience-designer**, for the words the composer adds and their
  register beside US1's, what the person sees when a transcript they were
  reading is replaced by a notice, and the precedent a window-level Escape
  sets for DS2's pickers.

Security-engineer was left out: no dependency, protocol, permission or
Rust change, and the close's words come from a local host the app
spawned. Product-designer was left out: the cut was made in DS1's
candidate table. Devops-engineer was left out: a host that is respawned
and reconnected is CV1.DS2.TS1's, and this story only notices the loss.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror as the system prompt, no tools, no session, no extensions, no
skills, no context files, nothing logged to Mirror). Each saw the plan,
the story, the test guide, the Delivery Story, CV1.DS2's index, the
repository rules, the development guide's lifecycle and verification
sections, D14, the debt ledger, the code the story touches (composer,
conversation, shell, host-unreachable, conversations store, host client,
connect and store, App, SignIn, Transcript), the test harness (fake host,
fake socket, renderApp, setup, queries, worlds), the existing conversation
and connect tests, and the Rust shell's host supervision.

The Driver then verified the sharpest claims:

- **Mid-turn, nothing is pending.** The real host answers `session.prompt`
  before the turn's events (`server.ts`: `sessions.prompt(...)` then
  `return`), and the fake host does the same (`#prompt`: reply, then
  broadcast). So a close while an answer streams rejects nothing, takes
  nothing back, and leaves `running: true` with Stop standing. The plan's
  "message back in the draft" after a mid-turn close was false; it holds
  for a held open and for a prompt not yet answered. Both engineer and
  quality-assurance found this; it is the review's sharpest finding.
- **A killed process is an unclean close.** A process that dies sends no
  close frame; the webview sees `close` with code 1006, an empty reason
  and `wasClean: false`. The fake host's `goAway()` as planned sent a
  clean 1001, a close the real failure never produces.
- **After a dead host, Try again fails before any close.** The new socket
  errors on connect, so the failure is "The host did not accept the
  connection." (`HostClient.connect`), not the close's words. Step 7 of
  the route named the wrong text.
- **A refused socket records a violation.** `FakeSocket` refuses only a
  URL nobody listened on, and records a `socket` violation for it; a
  reconnection test after `goAway()` would fail by name at teardown
  unless the fake socket learns to refuse without recording.
- **A held open is checked at teardown.** `checkScriptUsed` records a held
  open never released; `goAway()` must settle it.
- **The prompt's reply cannot be held.** The fake socket delivers queued
  frames before a host's close, so "prompt in flight when the host closes"
  cannot be staged at the UI level without a `heldPrompts` verb. The
  mechanism is proven at the client level (a pending request rejects on
  close) and the store level (a rejected prompt is taken back: existing
  test), so the UI claim is narrowed rather than the harness widened.
- **Two notices for one close.** `send()` rethrows a rejected prompt and
  the composer toasts it; `SignIn` toasts a rejected `auth.providers` or
  `auth.login`. A close that rejects them would toast the same words the
  shell shows in `HostUnreachable`.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision, and
ruled autofocus in: the text box takes focus when a Journey is shown, a
behavior the story did not name and the Driver had raised beside the plan.

| Decision | Options | Recommendation, ruled |
|---|---|---|
| R1 — a conversation whose answer was streaming when the connection was lost | (a) settle it now in the conversations store, from the same close path: `running: false`, a "Connection lost" notice row after the partial answer, the partial answer kept as it is; (b) leave `running: true` and write the residue into D6 and the ledger for DS2.TS1 | **(a)**: the close is this story's event; the change is small and cohesive; the acceptance "no Stop that reaches nothing" becomes true; and when the Journey is seen again the transcript says why the answer stopped |
| R2 — the host-gone notice when the loss came after the app was ready | (a) US1's copy unchanged, one notice for both moments; (b) the same screen with one more line when the host was lost after ready: "Pi was cut off mid-conversation. Relaunch Mirror Desktop to continue.", Try again kept; (c) a `lost` status keeping the transcript readable under the notice | **(b)**: US1's body was written for a host that never came up and says nothing about the conversation that just vanished, nor that relaunching is the way out today; one line fixes that. Try again stays: it is not silent (it reports its failure by name), and DS2.TS1 makes it work |
| R3 — Enter during IME composition, which submits today | (a) guard it in this story (`isComposing`, one line and a test); (b) ledger it | **(a)**: this is the keys story, and macOS dead keys compose |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. **The acceptance is split by what is in flight.** Three cases: an open
   in flight (rejected; the conversation fails with the close's words; the
   message back in the draft), a prompt in flight (rejected; taken back;
   no toast), and a turn streaming after the prompt was answered (nothing
   pending; R1 decides what the store does). The UI test stages the held
   open and the streaming turn; the prompt in flight is proven at the
   client and store levels (engineer 1; quality-assurance 1, 2).
2. **The close has a name.** `ConnectionLostError` in `host/client.ts`,
   code `connection_lost`, carrying `wasClean`, code and reason;
   `failureOf` has a branch for it, so nothing calls a lost connection an
   `internal_failure`. The words follow `wasClean`: "The connection to the
   host was lost." when unclean, "The host closed the connection." when
   clean, with the code and reason appended only when the socket gives
   them, so no empty parentheses (engineer 3; quality-assurance 3;
   experience-designer 2).
3. **No second notice.** The composer's and the sign-in panel's catches do
   not toast a `connection_lost` failure: the shell says it. The test
   asserts the close's words appear once (engineer 2; quality-assurance 4).
4. **`goAway()` is an unclean drop, and the port dies with it.** The fake
   socket gains a host-side `drop()`: queued frames first, then `error`,
   then `close` 1006 with `wasClean: false`; and a way to stop listening
   so the next socket errors on connect without recording a violation.
   `goAway()` drops every connection, stops listening, and settles held
   opens so teardown does not name them. `fakeSocket.ts` is named in
   scope (engineer 4; quality-assurance 3, 8, 9).
5. **Escape, once.** The listener ignores `event.repeat` (a held key fires
   a keydown per repeat), `event.isComposing` (an IME cancels with
   Escape), and `event.defaultPrevented` (the overlay rule: anything
   closable that handles Escape takes it first, which is how DS2.US3's
   pickers will not stop a turn). It is a hook, `useEscapeToStop`, keyed
   on running, client and Journey, so the composer stays one thing. Tests:
   repeat sends one abort; the Journey on screen not running while another
   runs sends nothing (engineer 5; quality-assurance 5, 6;
   experience-designer 5).
6. **The status region is always mounted**, empty when idle, so a live
   region announces the change rather than appearing already filled
   (engineer 6).
7. **The running line names the draft, declaratively.** "Pi is answering.
   Your draft stays here until it finishes; Escape stops it." No pulse,
   left under the text box within the measure. The Stop button's title
   is a backup; the line is where the shortcut is read
   (experience-designer 1, 5).
8. **`onClose` is set at `hostReady`.** Before ready, the pending
   rejection already reports the failure; after, the hook does. One path
   per phase (engineer 8).
9. **Step 7 names the right text.** After a dead host, Try again reports
   "The host did not accept the connection." (quality-assurance 8).
10. **A reconnection test.** After `goAway()`, the test serves a fresh fake
    host, presses Try again, and shows the Journey again: the state R1
    rules is on screen, the draft where it should be, no Stop that reaches
    nothing (engineer 4).
11. **Enter while the session opens gets a test**: the draft kept, one
    `session.open`, no prompt. D3 stands: Send is visibly disabled and
    the transcript says what is happening (quality-assurance 7;
    experience-designer 6).
12. **The ledger entry is written in this story**, not conditionally at
    Debt Review: after a reconnection, a conversation holds a session the
    new host does not know, and a failed open holds the old connection's
    words; both are DS2.TS1's. TD-002's description is extended for
    `onClose`, a second single-listener field on the connection, rather
    than a new entry (quality-assurance 10; engineer 7).
13. **The host store knows the loss came after ready**, which R2's line
    and the tests need either way (experience-designer 3).
14. **The route's step 6 expects the unclean words and the 1006 code**
    (quality-assurance 3).

**Not taken:**

- A fade on the transition from transcript to notice (experience-designer
  4): TS2's motion tokens exist, but the copy R2 adds is what tells the
  person the conversation was cut off; motion is not in this story.
- A lasting decision on the composer's register and the Escape overlay
  rule (experience-designer, for the Navigator): the composer's header
  comment carries both; DS2.US2's steer line and DS2.US3's pickers are
  the first to copy them, and a decision is written then if they hold.

## The reviews, as produced

### ◇ engineer

**Findings** (engineer lens: code structure, coupling, tests close to the code)

1. **D5 / Scope 4 — `conversations/store.ts`, and the plan's "Read from the code".** Mid-turn, nothing is pending. Both hosts answer `session.prompt` before the events (the store's own comment: "the turn's first events, which can arrive with the answer"), so by the time a turn streams, `send()` has resolved and the request map is empty. A close mid-turn rejects nothing, takes nothing back, and leaves `running: true` with Stop standing — exactly the state the plan says it closes. "The message in flight is back in the draft" holds only for a held open or a prompt not yet answered; the UI test "host goes away mid-turn … message back in the draft" would fail as written. The user message is also *correctly* in the transcript in that case: Pi received it. Two honest options: (a) a `hostConnectionLost(failure)` action in the conversations store, called from the same close path, that settles every running conversation (`running: false`, a diagnostic row or `failure`), so no Stop ever points at nothing — the close is this story's event, so the fix is cohesive; or (b) narrow the acceptance to the two provable paths and move the `running: true` residue into D6 explicitly. Navigator's call (below).

2. **Scope 4 — `Composer.tsx` `submit`.** `send()` rethrows a rejected prompt and the composer toasts it. When the rejection is the close, the toast fires while `Shell` already shows `HostUnreachable` with the same words: two notices for one condition, against D5's "one condition, one notice", and against the existing test discipline (`getAllByText(failed.message).toHaveLength(1)`). Fix: give the close its own error type (finding 3) and have the composer not toast what the shell says; test that the close's text appears once.

3. **Scope 4 — `host/client.ts` naming.** A plain `Error` for the close reaches `failureOf` as `internal_failure`, which is a lie, and no `HostError` code fits because it is not the host's answer. Introduce a named `HostClosedError` (code `connection_closed`, with `wasClean`, code and reason) and a `failureOf` branch. Also word it by `wasClean`: a `pkill`ed host arrives as 1006 and "The host closed the connection." is not what happened; "The connection to the host was lost" is.

4. **D7 / Scope 5 — `testing/fakeSocket.ts` is in scope and the plan does not say so.** `listen()` has no inverse, and the only refusal path in `FakeSocket` records a `socket` violation ("not the fake host's endpoint"), which would fail the Try-again test by name at teardown. Either let `accept()` refuse (return `null` → `error` + 1006, no violation) or add `stopListening(url)`. The reconnection test also needs a second `serveFakeHost` (the port is fixed, so `listen` and `scriptIpc` overwrite) — say so in Scope 4's test description, including that the second host's script is checked at teardown too.

5. **D1 — `Composer.tsx`.** Three details the acceptance's "once" needs: ignore `event.repeat` (holding Escape fires a keydown per repeat, one abort each), ignore `event.isComposing`, and key the effect on `[running, client, journeyId]`. Extract it as `useEscapeToStop(running, onStop)` so the composer stays one thing and the hook is testable without the form.

6. **D2 — `Composer.tsx`.** A `role="status"` region that mounts only while `running` is often not announced: live regions announce *changes to an existing* region. Render it always, empty when idle. The test queries `getByRole("status")` and its text either way.

7. **Scope 4 — `HostConnection` gains `onClose`.** A second mutable single-listener field widens TD-002's shape (one connection, handlers reassigned in place). Acceptable here; at Debt Review extend TD-002's description rather than open a new entry.

8. **Scope 4 — `host/connect.ts`.** With `onClose` set beside `onEvent`, a close during `models.available` calls `hostFailed` twice (onClose synchronously, then the request's catch). Harmless but two paths for one phase. Set `onClose` at `hostReady`: before ready the pending rejection reports, after ready the hook does.

9. **Validation Route step 1 / Scope 1.** Nothing — the Shift+Enter test is sound as described.

**Decisions**
- D1 — Agree, with the condition in finding 5 (repeat, composing, a named hook).
- D2 — Agree, with the condition in finding 6 (region always mounted).
- D3 — Agree.
- D4 — Agree.
- D5 — Agree with conditions: findings 1–3 (the mid-turn case has no pending request; a named close error; no second notice from the composer).
- D6 — Agree, provided finding 1 is resolved: either `running` is settled on close here, or the residue is written into D6, not left between them.
- D7 — Agree with the condition in finding 4 (the fakeSocket change named in scope, refusal without a violation).

**For the Navigator**
- Finding 1: on a close mid-turn, (a) settle every running conversation now in the conversations store — small, cohesive, and the acceptance "no Stop that reaches nothing" becomes true — or (b) narrow the acceptance to held-open and unanswered-prompt and move the `running: true` residue into D6 for DS2.TS1. The Driver should not pick this alone: it changes what the story closes.
- Finding 3: the close's words — one message ("The host closed the connection.") or two by `wasClean` ("closed" vs "lost"), since step 6 of the route will show 1006 for a killed process.

### ◇ quality-assurance

**Findings**

1. **Plan § Scope 4 / Acceptance Behavior, `conversations/store.ts`, `Conversation.test.tsx`.** The "host goes away mid-turn … message back in the draft" scenario is wrong for the realistic case. Once `session.prompt` is answered (the fake host replies before it streams; the real host too), nothing is pending: the close rejects nothing, `takeBack` never runs, the message stays in the transcript because it was delivered, and `running` stays `true`. "Message back in the draft" is true only for an open or a prompt still in flight. Split the scenario into three — open in flight, prompt in flight, turn streaming after the prompt was acknowledged — and write what each leaves behind (draft / transcript / `running`). The streaming case is the one the Navigator's step 6 exercises, and the plan's test as described would fail against it.

2. **Plan D7 / § Scope 5, `testing/fakeHost.ts`.** The fake host has no way to hold a `session.prompt` reply, so "prompt in flight when the host closes" cannot be tested deterministically: the reply is queued in the inbox a task after the frame arrives, and `#closeByHost` delivers queued frames before the close. Either add `heldPrompts` (symmetric with `heldOpens`) and test the prompt-in-flight rejection through it, or strike that claim from the acceptance and test only the held open.

3. **Plan D7, `testing/fakeHost.ts` / test-guide step 6.** `goAway()` closing with `1001 going away` does not model a host process dying. A killed process sends no close frame; the webview sees `close` with code `1006`, empty reason, `wasClean: false`, usually after an `error` event. The fake proves a path the real failure never takes, and "The host closed the connection." is false wording for it: the host vanished. Make `goAway()` default to an unclean 1006 (keep a clean variant for the graceful shutdown DS2.TS1 will add), and word the failure by `wasClean`: e.g. "The connection to the host was lost." vs "The host closed the connection (1001 going away)." Step 6's expected observation must match the 1006 wording.

4. **Plan D5 / § Scope 4, `host/client.ts`, `shell/Composer.tsx`, `SignIn.tsx`.** Rejecting every pending request on close fans the same failure into every caller that toasts: `Composer.submit` toasts a rejected prompt, `SignIn.refresh` and `SignIn.start` toast rejected `auth.providers`/`auth.login`. The person gets `HostUnreachable` plus one or more toasts with identical words. Give the close a distinct code (`connection_closed`) and have those callers not toast it — the area already says it — and assert `getAllByText(...)` has length 1, as the failed-open test does.

5. **Plan D1 / § Scope 2, `shell/Composer.tsx`.** A window `keydown` fires on key repeat: holding Escape for half a second sends a dozen `session.abort`s, which contradicts "once". Ignore `event.repeat`. Also ignore `event.isComposing` (an IME uses Escape to cancel composition). Add a test for repeat.

6. **Plan § Scope 2 tests, `Conversation.test.tsx`.** No Escape test covers the Journey switch: Garden running, Beds on screen, Escape must send nothing (the existing Stop test covers the button, not the key). Since the listener is mounted by the Composer on screen and unmounted on switch, this is exactly the seam that would break if someone later hoists the listener. Add it.

7. **Plan D3, `shell/Composer.tsx`.** Enter in the text box while `opening` calls `submit()` and `send()` returns silently; Send is disabled but Enter is not. "Nothing in the composer is ever silently dead" does not hold there. At minimum add the test (type during a held open, Enter, draft kept, one `session.open`, no prompt); whether to also show a line is the Navigator's (see below).

8. **Plan D5 / test-guide step 7.** After a dead host, Try again hits a closed port: the socket errors before open and the failure is "The host did not accept the connection.", not the close's words. State the exact text so a pass/fail is unambiguous; and in tests, `goAway()` marking the host gone must actually refuse the next socket (today `FakeSocket` refuses only an address nobody `listen`ed on — `goAway` must unregister or `accept` must refuse).

9. **Plan § Scope 4 ("open is held and the host goes away"), `testing/fakeHost.ts` `checkScriptUsed`.** A held open whose host went away is still "held, never released" at teardown and fails the test by name. Either `goAway()` marks held opens released, or the test must still call `release()` into the dead socket. Say which.

10. **Plan D6 / D5, `conversations/store.ts`.** A rejected open leaves the conversation at `status: "failed"` with the close's words as `failure`, so after any reconnection the Journey shows "The session could not open in ~/garden." with a connection reason — a stale second notice; and a conversation that was streaming keeps `running: true` with Stop and the D2 line forever. DS2.TS1's outcome does not name stale sessions or flags. Record the ledger entry now, not "at Debt Review if".

11. **Plan § Objective ("Enter already behaves"), `shell/Composer.tsx`.** Enter during IME composition (`event.isComposing`) submits the draft today. Not in scope as written, but the story claims the keys are "settled"; see Navigator.

**Decisions**
- D1 — Agree with a condition: ignore `event.repeat` and `event.isComposing`; add the Journey-switch and repeat tests.
- D2 — Agree.
- D3 — Agree with a condition: the Enter-while-opening no-op gets a test; whether it also gets a word is the Navigator's.
- D4 — Agree.
- D5 — Agree with conditions: split the acceptance per finding 1, a distinct close code with no duplicate toasts, wording by `wasClean`.
- D6 — Agree with a condition: the ledger entry is written in this story, not conditionally later.
- D7 — Disagree as specified: unclean 1006 by default, held prompts or a narrowed claim, held opens and the refused reconnection handled explicitly.

**For the Navigator**
- D5 vs the `lost` alternative: as proposed, a host that dies mid-answer replaces a long partial answer with `HostUnreachable`, and since nothing respawns the host until DS2.TS1, the partial answer is unreadable until a relaunch loses it entirely. Options: (a) one notice, accept the loss until DS2.TS1; (b) a `lost` status that keeps the transcript readable under the notice. QA's view: (a) is coherent and testable now; the cost is real but bounded by DS2.TS1's timing.
- Enter during IME composition submits today. Options: (a) add the one-line guard and test in this story, since it is the keys story; (b) ledger it.
- Enter while the session opens: (a) silent no-op with a test only (D3 as written); (b) the same D2 status line with "Opening…" wording.

**Release confidence:** not ready as planned. The host-gone path (D5/D7) is the risky seam and its acceptance describes a state the realistic failure does not produce; the fake models a close the real host never sends. With findings 1–5 and 8–9 fixed in the plan, the story is ready with the known risk of stale `running`/`failed` conversations after reconnection, recorded in the ledger.

### ◇ experience-designer

**The experiential question beneath this plan:** the story promises "never sit in front of a control that does nothing." The composer side is answered; the question is whether the words it adds speak in the shell's register (declarative, quiet, an instrument), and whether the plan ships, in the same story, a new dead control on the host-gone screen.

**Findings**

1. **D2 / Scope 3, `Composer.tsx` — the running line does not name the thing that is dead.** The silent control is Enter. "Pi is answering. Wait for it, or stop it with Stop or Escape." tells the person what the streaming transcript, the Stop button and the sidebar's Working mark already show, and says nothing about Enter or the draft. A person who pressed Enter and saw nothing reads it and still does not know their message was refused and kept. "Wait for it" is also an imperative, a register the shell never uses elsewhere ("Opening in ~/garden…", "The session could not open in…", "Your message is back in the composer" — all statements). Rewrite as a statement about the composer: e.g. "Pi is answering. Enter will send once it finishes; Escape stops it." One sentence, `text-ui text-muted`, no Pulse (the transcript and sidebar already pulse; a third living indicator for one state is noise), left-aligned under the text box inside the measure, not spanning under Stop.

2. **D5, `host/client.ts` / `HostUnreachable.tsx` — "The host closed the connection." says intent where there was a crash.** A host process dying reaches WebKit as 1006 with an empty reason; `goAway()` sends 1001. "Closed" reads as a decision the host made; for a crash the truthful word is "lost". Use a neutral sentence ("The connection to the host was lost.") and format the code so an empty reason leaves no "(1006 )" or empty parentheses in the mono line. The human sentence belongs in the mono `failure` slot only if it stays short; the code and reason are the host's words and belong there, nothing else.

3. **D5 + D6 / Validation step 7, `HostUnreachable.tsx` — the story that closes dead controls ships one.** After a mid-turn loss, Try again cannot succeed until DS2.TS1 respawns the host; the person presses it, gets the same notice, presses again. The notice's body ("Until the host answers, nothing here can work.") was written for a host that never came up and says nothing about what just happened to the conversation on screen, nor that relaunching is the way out. Coherence of one notice is right; coherence of one *copy* across two different moments is not. The notice needs to know whether the failure came after `ready` (a `lostAfterReady` or the failure's origin in the host store) and, in that case, add one line: what happened to the conversation ("Your conversation and draft are kept.") and the real next step today ("Relaunch Mirror Desktop to continue."). Put the shape of this to the Navigator (below), but do not ship step 7 as written: a button that can only fail, with no word that it will, is the pattern the story exists to end.

4. **D5 — the transition from a live transcript to a centered notice is an instant blank.** The person is mid-reading; the area swaps to a title in the middle of empty space. Honest, but it reads as "the conversation is gone", which is why finding 3's line about the conversation being kept matters more than any motion. If TS2's motion tokens have a short fade, use it here; otherwise rely on the copy.

5. **D1, `Composer.tsx` — a window-level Escape sets a precedent the next stories will collide with.** DS2.US3 puts model and thinking pickers in the header; any popover or menu is closed by Escape, and a person closing a picker mid-turn must not stop the turn. The plan's stop condition names only the sign-in panel. Record now, in the composer's header comment or a decision if the Navigator makes D1 lasting: Escape stops the turn only when nothing closable has focus; an overlay takes Escape first. Also: the `title="Stop (Escape)"` tooltip is fine, but the running line (finding 1) is where the shortcut should be read; the button's title is a backup, not the teaching surface.

6. **D3 — agree, with one check.** While opening, Enter is also a silent no-op (`send()` returns on `opening`), but Send is visibly disabled and the transcript says "Opening in…". The disabled Send is an honest signal; no second line. Nothing to add.

**Decisions**
- D1 — Agree with a condition: name the overlay rule (Escape yields to anything closable) before DS2.US3 lands; otherwise the shortcut that feels right today will stop a turn the person meant to leave alone.
- D2 — Agree with a condition: the line names Enter and the kept draft in a declarative sentence, no Pulse, left-aligned under the text box (finding 1).
- D3 — Agree.
- D4 — Agree.
- D5 — Agree with a condition: a neutral close sentence with clean code/reason formatting (finding 2), and a notice that knows it is showing after `ready` and says what happened to the conversation and what to do (finding 3).
- D6 — Agree that reconnection is DS2.TS1's; disagree that the gap can live only in the ledger — the person must read the way out on screen until TS1 ships (finding 3).
- D7 — Agree.

**For the Navigator**
- The host-gone notice after a mid-conversation loss. Options: (a) US1's copy unchanged, one notice for both moments — coherent, but the person sees their transcript vanish, no word about it, and a Try again that cannot succeed today; (b) the same screen with one extra line when the loss came after `ready`: the conversation and draft are kept, and relaunch to continue until a host restart exists — my recommendation; (c) the plan's rejected `lost` status that keeps the transcript readable under the notice — truer to the person's place in the conversation, but a second host-gone screen and more than this story should carry.
- Whether D1 and the register of D2's line (composer states, never instructs) become a lasting decision, since both will be copied by DS2.US2's steer/follow-up line and DS2.US3's pickers.
