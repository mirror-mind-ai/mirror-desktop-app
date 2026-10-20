[< CV1 Daily Use](../index.md)

# CV1.DS2 — Sessions and Live Control

**Status:** 🟡 Planned
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
| CV1.DS2.US1 | Sessions per Journey | User Story | The Journey's sessions are listed newest first with title and date; opening a Journey resumes its most recent session with the transcript loaded from the session file; "New session" starts another; a session resumed in the desktop can be continued in terminal Pi with `pi -r`, and vice versa | 🟡 Planned |
| CV1.DS2.US2 | Steering, follow-up and stop | User Story | While a turn runs, a message can be sent as a steer (after the current assistant turn) or a follow-up (after the run), the queue is visible, and Stop aborts cleanly with the partial answer kept and the Mirror conversation intact | 🟡 Planned |
| CV1.DS2.US3 | Model and thinking | User Story | The available models and thinking levels are chosen from the app, per session, with the choice shown in the conversation header; the default comes from Pi's settings | 🟡 Planned |
| CV1.DS2.TS1 | Lifecycle hygiene | Technical Story | Quitting the app closes every session (`session_shutdown` reaches Mirror) within a bounded wait before the host exits; a restart reconnects the UI to a fresh host and reopens the last Journey; a turn silent beyond a bound is named stalled; the host writes a rotated log file under the app's data root | 🟡 Planned |

## Done Condition

A week of daily use: sessions resumed across restarts and across terminal and
desktop, turns steered and stopped without a lost message, no orphaned host
and no Mirror conversation left open by a quit.
