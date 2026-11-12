[< CV1 Daily Use](../index.md)

# CV1.DS2 — Sessions and Live Control

**Status:** 🟡 In progress
**Type:** Delivery Story
**Depends on:** CV1.DS1 (the shell these capabilities live in)

---

## Outcome

A Journey's conversations are its Pi sessions, many of them, listed where the
Journey is: resume the most recent by default, pick an older one, start a
new one — and see the same list from terminal Pi, because they are the same
files. A running turn can be steered, followed up and stopped; the model
and thinking level are chosen in the app; the app quits and restarts without
orphaning a host, losing a draft, or leaving a Mirror conversation open.

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV1.DS2.US1](cv1-ds2-us1-sessions-per-journey/index.md) | Sessions per Journey | User Story | The Journey's sessions are listed in the conversation's header, newest first with title and date, the same files `pi -r` lists; picking a Journey shows its most recent session read from its file, and picking a session or "New session" is a look too; the first send resumes the session shown or starts the new one ([D14](../../../decisions.md#d14--selecting-a-journey-shows-it-the-first-send-opens-its-session)), the host keeping one open session per Journey; a session resumed in the desktop continues in terminal Pi with `pi -r`, and vice versa | ✅ Done — 2026-10-29 |
| [CV1.DS2.US2](cv1-ds2-us2-steering-follow-up-and-stop/index.md) | Steering, follow-up and stop | User Story | While a turn runs, Enter sends a message as a steer (before Pi's next step) and Option+Enter as a follow-up (after it finishes), Pi's own queue listed above the composer and each message drawn where Pi takes it; Stop withdraws the queue back into the draft, keeps the partial answer marked Stopped, and leaves the session and its Mirror conversation open ([D17](../../../decisions.md#d17--a-running-turn-takes-a-message-as-pi-does-and-stop-gives-back-what-it-queued)) | ✅ Done — 2026-11-05 |
| [CV1.DS2.US3](cv1-ds2-us3-model-and-thinking/index.md) | Model and thinking | User Story | The header always says the model and thinking level the session shown runs on next, each a control: a file's own before it opens, Pi's default for a new session; a choice is for the session only, held until the first send, applied at once on the open session and at Pi's next request during a run, recorded in the file for `pi -r`, never in Pi's settings; a model change keeps the level, clamped; only the models Pi itself has a credential for, behind a filter ([D18](../../../decisions.md#d18--a-sessions-model-and-thinking-are-chosen-as-pis-model-and-thinking-choose-them)) | ✅ Done — 2026-11-12 |
| CV1.DS2.TS1 | Lifecycle hygiene | Technical Story | Quitting the app closes every session (`session_shutdown` reaches Mirror) within a bounded wait before the host exits; a restart reconnects the UI to a fresh host and reopens the last Journey; a turn silent beyond a bound is named stalled; the host writes a rotated log file under the app's data root | 🟡 Planned |

## Done Condition

A week of daily use: sessions resumed across restarts and across terminal and
desktop, turns steered and stopped without a lost message, no orphaned host
and no Mirror conversation left open by a quit.

## Planning Inputs

Three patterns from Pi Durable, the experimental harness Pi's makers ship
beside Pi 1.0 for agents that must outlive their process and serve several
clients ([the post](https://earendil.com/posts/pi-durable/); the README of
`@earendil-works/pi-durable` 1.4.0). They are inputs to Plan, not a
dependency: the host stays on the coding agent's SDK
([D2](../../../decisions.md#d2--one-long-lived-node-host-the-shell-stays-thin)),
whose sessions terminal Pi shares
([D7](../../../decisions.md#d7--conversations-are-pi-sessions-many-per-journey)).
Each names the stories whose plans answer it; a plan adopts, adapts or
rules it out, and says why.

1. **A send carries an id, so it lands once** — TS1, US2. Pi Durable takes
   a `requestId` with each submission and answers a repeat with the
   original, so a client that retries after a crash never asks twice.
   Today, after a loss, the UI cannot tell whether a send in flight reached
   Pi: [US3](../cv1-ds1-the-conversation-shell/cv1-ds1-us3-composer/index.md)
   puts it back in the draft, a guess that holds only while nothing
   reconnects ([TD-004](../../technical-debt-ledger.md)). Once TS1
   reconnects the UI and US1 resumes a session whose file may already hold
   the message, and once US2 queues what a running turn now refuses, the
   guess can send a message twice. The plans decide where the id is made,
   how long the host remembers it (one host run, or across restarts in the
   session file, which takes custom entries), and how a reconnected UI
   learns which of its sends landed.

2. **A connection starts from the current view, then receives changes** —
   TS1, US1, US2. In Pi Durable a client that joins late or reconnects
   first receives the whole current view (the transcript, the answer
   streaming, the tools running, the queue) and then only changes; nothing
   is replayed. Today `hello` answers with the host's identity alone, a
   connection receives only the events that leave Pi after it, and after a
   loss the UI keeps what the old host gave it (TD-004). TS1 decides what a
   connection receives before its first event, so a reconnected UI rebuilds
   from the host's view instead of reconciling what it kept: the transcript
   read from the session file (US1), and for a turn in flight its partial
   answer, its running tools and its queue (US2).

3. **Every queued message has a stated fate** — US2, TS1. Pi Durable keeps
   its queue in storage, beside the transcript: queued inputs survive a
   crash, are withdrawn by an abort, and after a failed run stay queued by
   default (`afterFailedRun`: `keep`, `continue` or `withdraw`). Pi keeps
   its queue in the host's memory, so a host that dies takes it along.
   Pi's terminal, on Escape, puts queued messages back in the editor before
   it aborts, while the SDK's `abort()` alone leaves the queue as it is
   (`clearQueue()` returns it). US2 states what Stop and a failed run do to
   the steering and follow-up queue, TS1 what a lost host does to it, and
   the screen shows each, so no message is lost or sent unseen. The stopped
   answer itself is already in US2's outcome: kept, and marked by the
   `stopReason` its `message_end` carries.

**Answered so far.** US1 ([plan](cv1-ds2-us1-sessions-per-journey/plan.md),
D11) builds the read Input 2 needs: `session.transcript`, a session's rows
read from its file, the current view of a session no turn is running. TS1
decides what a reconnected UI reads first, and US2 what a turn in flight
adds. Inputs 1 and 3 are not US1's: they stay with US2 and TS1.

US2 ([plan](cv1-ds2-us2-steering-follow-up-and-stop/plan.md),
[D17](../../../decisions.md#d17--a-running-turn-takes-a-message-as-pi-does-and-stop-gives-back-what-it-queued))
answers Input 3 for the desktop. Stop withdraws the queue before and
after the abort and gives it back to the draft. A failed run continues
with the queue, as Pi decides inside its run. A queue Pi still holds at a
settle stays on screen. The queue dies with a lost host, and what it held
goes back to the draft. It adopts Input 2's view without building it: the
host keeps no queue of its own, so TS1 can rebuild a turn in flight from
Pi's. Input 1, a send that carries an id, it leaves whole to TS1: nothing
reconnects yet, and nothing queued survives a loss to be sent twice.
