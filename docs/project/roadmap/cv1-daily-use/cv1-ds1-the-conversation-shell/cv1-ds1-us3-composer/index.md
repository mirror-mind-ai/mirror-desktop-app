[< Parent](../index.md)

# CV1.DS1.US3 — Composer

**Status:** ✅ Done — 2026-10-28
**Type:** User Story

---

## User Story

As a person writing to Pi in the app,
I want the composer to behave the way my hands expect — Enter sends, Shift+Enter breaks a line, Escape stops the answer — and to tell me plainly, whenever it cannot send, why not,
So that I never wonder whether a message went, and never sit in front of a control that does nothing.

## Outcome

The text box takes focus when a Journey is shown, so picking and typing
is one motion. The composer's keys are settled and proven: Enter sends the draft, and
not while an IME is composing; Shift+Enter puts a line break in it; and
Escape, while Pi answers, stops the turn once from wherever the hands are
in the window, the same as the Stop button, yielding to anything closable
that takes Escape first. Nothing in the composer is ever silently dead.
While a turn runs, a line under the text box says Pi is answering, that
the draft stays until it finishes, and that Escape stops it; the draft
can still be typed. The conditions outside the composer keep the one
notice US1 gave each, which now covers every way they arise: no model to
use shows the sign-in panel in the conversation's place, and a host that
cannot be reached shows "The host could not be reached" with Try again,
including the case this story closes, where the host goes away after the
app came up. Until now that case was invisible: the socket's close was
not listened to, so a message sent to a dead host stayed in the
transcript forever, Stop in place, with no answer and no word. Now the
connection's close is noticed and named, a lost connection told apart
from a closed one; every request waiting on it fails by that name; a
message in flight goes back to the draft; an answer that was streaming
stops with "Connection lost" after it and no Stop pointing at nothing;
and the area says what happened and, since nothing brings the host back
today, that relaunching is the way to continue.

Drafts already survive switching Journeys (US1). Attachments by drag and
drop are out of scope here.

## Acceptance Behavior

```text
Given a Journey on screen with "Hello" in the composer
When the person presses Enter
Then "Hello" is sent, shows in the transcript, and the composer is empty

Given a Journey on screen with "Hello" in the composer
When the person presses Shift+Enter and types "there"
Then the draft reads "Hello", a line break, "there", and nothing was sent

Given a turn running in the Journey on screen
When the person presses Escape, wherever focus is in the window, held down or not
Then the host receives session.abort for that Journey's session once, the same as a click on Stop
And a press of Escape while nothing runs, or while only another Journey runs, changes nothing, the draft included

Given a turn running in the Journey on screen
When the person looks at the composer
Then under the text box it says Pi is answering, that the draft stays until it finishes, and that Escape stops it; Stop stands where Send was, and the text box still takes typing
And Enter sends nothing and keeps the draft
And when the turn settles the line goes and Send is back

Given the session opening for the Journey on screen
When the person presses Enter
Then nothing is sent and the draft is kept

Given a turn streaming, or a session opening, in the Journey on screen
When the host's connection drops
Then the conversation area says the host could not be reached, that the connection was lost, that Pi was cut off and relaunching continues, and offers Try again, once and with no toast
And a Stop or Send that can no longer reach anything is not on screen
And when the Journey is seen again, a streaming answer has stopped with "Connection lost" after it and Send back, and a message whose open was in flight is back in the draft

Given the app connected and signed in, and the person closes the window or presses Try again
When the app closes its own connection
Then no host failure is reported for that close
```

## Scope

- The text box takes focus when a Journey is shown, so picking and typing
  is one motion.
- Enter sends, Shift+Enter breaks a line: the behavior stands; the missing
  Shift+Enter test is added, and Enter yields while an IME composes.
- Escape stops the running turn of the Journey on screen once, from
  anywhere in the window, yielding to anything closable that takes it
  first; the Stop button announces the shortcut.
- A standing line under the text box while a turn runs, saying why the
  composer cannot send, that the draft stays, and what stops the turn.
- The host's connection closing after it was ready is noticed and named:
  pending requests fail by that name, a message in flight is taken back, a
  streaming answer is settled with a notice, the host store reports the
  loss, and the area shows the notice US1 built for it with one more line
  about the conversation and the way to continue.
- The fake host can go away as a killed process does, so the above is
  proven against it.

## Out Of Scope

- Sending while a turn runs as a steer or a follow-up, and what Stop leaves
  in the transcript: CV1.DS2.US2.
- Reconnecting on its own, a fresh host after one dies, and what the
  conversations do with their sessions after a reconnection: CV1.DS2.TS1,
  ledgered by this story.
- Changing where sign-in is shown when no model can be used: US1 settled
  it; CV2 reworks sign-in.
- Attachments by drag and drop.

## Validation

Every behavior above has a UI test against the fake host, including the
host going away mid-turn; the Navigator validates the keys, the running
line and the host's loss in the window, by the route in
[test-guide.md](test-guide.md).
