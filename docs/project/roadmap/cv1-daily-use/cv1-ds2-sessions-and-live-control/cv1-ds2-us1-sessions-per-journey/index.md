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
Mirror opens a new conversation on resume, as it does for a terminal
`pi -r`, and none on a look. One session is open per Journey at a time:
picking another closes the open one first, and the list waits while a
turn runs. A session with more history than the screen needs is shown
from its end, with one line saying how much came before; a Journey whose
sessions cannot be read says so and still sends. The `mirror` Journey's
760 sessions list and show within a moment, because the host reads the
head of each file rather than the whole.

## Acceptance Behavior

```text
Given a Journey with sessions in its folder, none open in the app
When the person picks it in the sidebar
Then the transcript shows its most recent session, read from the file, with no session opened and nothing written to Mirror
And the header's sessions button names that session's title and date

Given the Journey on screen
When the person opens the sessions list
Then it lists "New session" first, then the Journey's sessions newest first, each with its title and date, the shown one marked
And Escape closes the list without stopping a running turn

Given the sessions list open
When the person picks an older session
Then the transcript shows that session, read from its file, and nothing was opened
And if a session was open and idle for this Journey, it was closed first

Given a session shown and not open
When the person sends a message
Then the host resumes that session file and the turn's rows follow the read transcript
And the session can be continued in terminal Pi with `pi -r`, and one begun there appears here and continues

Given the Journey on screen
When the person picks "New session"
Then the transcript is empty with a line saying the first message starts it
And the first send opens a session with no file

Given a Journey whose folder has no sessions
When the person picks it
Then the transcript shows the new-session line and the button says "New session"

Given a session with more entries than the screen shows
When it is shown
Then the last ones are drawn, with one line saying how many earlier messages are not shown

Given a turn running in the Journey on screen
When the person looks at the sessions button
Then it is disabled and says to wait for the answer or stop it

Given the host cannot read the Journey's sessions
When the Journey is picked
Then the transcript area says so, shows the host's words, and offers Try again
And the composer still sends, which opens a new session
```

## Scope

- The protocol: a Journey's sessions listed, a session's transcript read,
  and `session.open` resuming a named file.
- The host: a light index of a project's session folder (header, modified
  time, a title from the head of each file); a session file projected onto
  transcript entries, bounded from the end; resume through Pi's own
  `SessionManager.open`, refused outside the Journey's folder.
- The UI: the conversation knows which session it shows; the most recent
  is read on pick; a sessions list in the header with "New session"; the
  first send resumes what is shown; one open session per Journey, the
  previous closed on a pick.
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
