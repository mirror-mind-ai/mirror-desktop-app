[< Parent](../index.md)

# CV1.DS2.US2 — Steering, follow-up and stop

**Status:** ✅ Done — 2026-11-05
**Type:** User Story

---

## User Story

As a person conversing with Pi in the app while it answers,
I want to send a message into the running turn the way terminal Pi lets me — steering it after the current turn, or following up after it finishes — to see what is waiting, and to stop the answer with what it said so far kept and nothing I queued lost,
So that a long answer is something I can shape and end, not something I wait out.

## Outcome

While a turn runs, the composer is no longer dead: Enter sends the draft
before Pi's next step (a steering message, delivered after the assistant's
current turn and before its next request), and Option+Enter sends it after
Pi finishes (a follow-up, delivered when the answer would otherwise end);
the Steer and Follow up buttons do the same by mouse. What is queued is
visible above the text box, each message named by its kind, from the
moment it is sent until Pi takes it, at which point it appears in the
transcript as the person's message, where it was said, in the form Pi
keeps it. A line says that Stop puts queued messages back in the draft,
and it does: Stop (and Escape) aborts the run the way terminal Pi's
Escape does — the partial answer stays in the transcript, marked
"Stopped", and every queued message is withdrawn and put back in the
draft, before whatever was being typed, so nothing is sent unseen into
the next turn, even a message that was still on its way when Stop landed.
The session stays open and its Mirror conversation stays the same; the
next send continues both. A message the host refuses goes back to the
draft with the reason said once, in the host's words, never discarding
what was typed meanwhile; a message Pi ran as a command is said once too.
A failed run continues with what was queued, as Pi does in the terminal,
and the screen shows it. A queue Pi still holds when a turn settles stays
on screen rather than riding the next turn unseen. The connection lost
while messages wait puts them back in the draft too.

## Acceptance Behavior

```text
Given a turn running in the Journey on screen
When the person types a message and presses Enter, or clicks Steer
Then the message is queued as a steering message, the draft is empty, and the queue above the composer shows it as sending, then as "Steering", with a line saying Stop puts it back in the draft
And when Pi delivers it, it leaves the queue and appears in the transcript as the person's message, before the answer that follows it

Given a turn running in the Journey on screen
When the person types a message and presses Option+Enter, or clicks Follow up
Then the message is queued as a follow-up, shown as "Follow-up" in the queue
And it is delivered after the answer would have ended, and its own answer follows it

Given a turn running with messages queued
When the person presses Escape or clicks Stop
Then the host withdraws every queued message around the abort, a message still on its way included, the partial answer stays in the transcript marked "Stopped", the queue is empty, and the withdrawn messages are back in the draft, queued ones first, then what was being typed; the text box has focus
And a message Pi had already taken when Stop landed is in the transcript, not in the draft
And the session is still open, its Mirror conversation is the same one, and the next send continues them

Given a turn stopped before any of its answer streamed, or during a tool call
When the transcript settles
Then it shows a stopped answer with no text, after the tool's error result when there was one, so the stop is visible

Given the person sends while the turn settles (a steer that arrives at an idle or settling session)
When the host answers that the message started a new run, or was deferred to after the settle
Then the message appears in the transcript as the first message of that run, once, and the conversation shows as running from Pi's own start

Given a message the host refuses before Pi starts it (no model, no credential, compaction in progress)
When the host answers with the refusal in its own words
Then the message is back in the draft, before what was typed meanwhile, and the reason is said once

Given a message Pi ran as an extension command
When the host answers so
Then nothing is drawn, a line says Pi ran it as a command, and the conversation runs only if Pi starts a run

Given a queue Pi still holds when a turn settles
When the turn settles
Then the queue stays on screen as Pi last reported it

Given a run that fails with an error after a follow-up was queued
When Pi continues with the queue
Then the transcript shows the error, then the follow-up as the person's message, then its answer, and the queue empties

Given messages queued, and one still on its way, when the connection to the host is lost
When the conversation settles
Then each is back in the draft once, with the connection-lost notice after the partial answer

Given a turn running
When the person presses Enter on an empty draft, or while the sessions list is open
Then nothing is sent and nothing stops
```

## Scope

- The protocol: `session.prompt` carries how a message joins a running turn
  (steer or follow-up) and answers with what Pi did with it (started,
  queued, handled, deferred); `session.abort` answers with what it
  withdrew; a named refusal in the host's words for what it can check
  before Pi.
- The host: prompts are accepted one at a time per session through Pi's
  own preflight, as Pi's RPC mode does, so a rejection reaches the UI as
  an answer and not as an event; Stop withdraws the queue before and after
  it aborts, keeps out what Pi delivered meanwhile, and returns the rest.
- The UI: the composer steers and follows up while a turn runs; the queue
  is visible, sending messages included, and says what Stop does; a
  delivered message enters the transcript from Pi's own event; a stopped
  answer is marked; withdrawn and refused messages return to the draft by
  one rule that never discards.
- The fake host plays what Stop does to a held turn, keeps a queue the way
  Pi does, and delivers scripted mid-turn messages from it.

## Out Of Scope

- Withdrawing the queue, or one message of it, without stopping (Pi's
  dequeue key); refusing a `/` command while running; queueing during
  compaction; the typed form of a message Pi expanded; images on any
  message.
- A send that carries an id, and the view a reconnected UI reads of a turn
  in flight: CV1.DS2.TS1 (Planning Inputs 1 and 2).
- Choosing the model and thinking level: CV1.DS2.US3.
- Any change to the Mirror core or the Rust shell.

## Validation

Every behavior above has a test: the protocol's schemas, the host's turn
control against a stub of Pi's session, the store against a stub
connection, and the composer and transcript against the fake host. The
Navigator validates in the window on a Journey they name, with terminal Pi
and `mirror conversations` as witnesses that a stop keeps the session and
its conversation, by the route in [test-guide.md](test-guide.md).
