[< Parent](../index.md)

# CV1.DS2.US1 — Sessions per Journey

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a person working a Journey in the desktop and in terminal Pi,
I want the Journey's sessions listed where I converse, the most recent shown when I pick the Journey, any of them resumed by my first message or a new one started on purpose,
So that a conversation I began in either place continues in the other, and picking a Journey costs nothing in Mirror.

## Outcome

A conversation is a Pi session, and a Journey has many
([D7](../../../../decisions.md#d7--conversations-are-pi-sessions-many-per-journey)).
Until now the app showed none of them: every first send opened a fresh
session, and what was said yesterday was reachable only from the terminal.
Now picking a Journey shows its most recent session, read from the session
file terminal Pi writes, with nothing opened and nothing written to Mirror
([D14](../../../../decisions.md#d14--selecting-a-journey-shows-it-the-first-send-opens-its-session)
holds). The header names the shown session by its title and date and
opens the Journey's sessions, newest first, the same files `pi -r` lists
for that project; picking one shows it the same way, and "New session"
shows an empty transcript that says the first message starts it. The
first send resumes the shown file, or opens a new session when none is
shown; Pi appends to the same file both ways, so a session resumed here
continues in the terminal and one begun there appears and continues here.
Mirror opens a new conversation on resume when the file's old one had
ended, as it does for a terminal `pi -r`, and none on a look. One session
is open per Journey at a time, and the host keeps it so: the send that
opens another closes the one before; a pick only shows. While a turn
runs the list can be read but not picked from, and says so. A session
with more history than the screen needs is shown from its end, with one
line saying how much came before, and no single entry can flood the
screen; a Journey whose sessions cannot be read, or a session that
cannot, says so and still sends. The host shows or resumes only files
inside the Journey's own session folder, and never the same file twice.
A Journey with hundreds of sessions lists and shows them within a
second, because the host reads the head of each file rather than the
whole: 760 sessions list in under a tenth of a second.

## Acceptance Behavior

```text
Given a Journey with sessions in its folder, none open in the app
When the person picks it in the sidebar
Then the transcript says it is reading, then shows its most recent session read from the file, opened at its end, with no session opened and nothing written to Mirror
And the header's sessions button names that session's title and date

Given the Journey on screen
When the person opens the sessions list
Then it lists "New session" first, then the Journey's sessions newest first, each with its title and date, the shown one marked and in view
And Escape closes the list without stopping a running turn

Given the sessions list open
When the person picks an older session
Then the transcript shows that session, read from its file, and nothing was opened or closed
And picking the session already shown changes nothing

Given a session shown and not open
When the person sends a message
Then the host resumes that session file, closing the Journey's previously open session first if there was one, and the turn's rows follow the read transcript
And the session can be continued in terminal Pi with `pi -r`, and one begun there appears here and continues

Given the Journey on screen
When the person picks "New session"
Then the transcript is empty with a line saying the first message starts it
And the first send opens a session with no file, and the button then names it

Given a Journey whose folder has no sessions
When the person picks it
Then the transcript shows the new-session line and the button says "New session"

Given a session with more entries than the screen shows
When it is shown
Then the last ones are drawn, a tool call never parted from its result, with one line saying how many earlier messages are not shown
And an entry's text over the cap is cut with a marker

Given a turn running in the Journey on screen
When the person opens the sessions list
Then its options are disabled and a line says Pi is answering and to pick a session when it finishes

Given the host cannot read the Journey's sessions, or the shown session's file
When the Journey or the session is picked
Then the transcript area says so, shows the host's words, and offers Try again
And the composer still sends, which resumes the shown file or opens a new session

Given a session file outside the Journey's folder, or one already open under another Journey
When the UI asks to show or resume it
Then the host refuses by name and opens nothing
```

## Scope

- The protocol: a Journey's sessions listed, a session's transcript read,
  and `session.open` resuming a named file.
- The host: a light index of a project's session folder (header, modified
  time, a title from the head of each file); a session file projected onto
  transcript entries, bounded from the end and per entry; resume through
  Pi's own `SessionManager.open`, contained to the Journey's folder,
  never the same file twice, the Journey's previous session closed by
  the open.
- The UI: the conversation knows which session it shows; the most recent
  is read on pick; a sessions list in the header with "New session",
  readable but not pickable while a turn runs; the first send resumes
  what is shown.
- The fake host scripts sessions per Journey, so every UI path is proven
  without Pi.

## Out Of Scope

- Steering, follow-up and what Stop leaves: CV1.DS2.US2.
- Choosing the model and thinking level: CV1.DS2.US3.
- Reconnecting to a new host and settling TD-004: CV1.DS2.TS1.
- Renaming, deleting, forking, branching or searching sessions; loading
  the earlier messages a bounded transcript left out; message counts;
  Mirror's titles as session titles (CV4).
- Any change to the Mirror core or the Rust shell.

## Validation

Every behavior above has a test: the protocol's schemas, the host's index
and projection on written files, the store against a stub connection, and
the UI against the fake host. The Navigator validates in the window on a
Journey they name, with terminal Pi beside it and `mirror conversations`
as the witness that a look writes nothing and a send writes one, by the
route in [test-guide.md](test-guide.md).
