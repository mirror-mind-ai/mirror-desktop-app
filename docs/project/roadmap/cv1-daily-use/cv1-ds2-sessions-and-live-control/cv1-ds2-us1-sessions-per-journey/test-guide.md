[< Story](index.md)

# Test Guide — CV1.DS2.US1 Sessions per Journey

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
npx vitest run packages/host/src/sessionIndex.test.ts packages/host/src/transcript.test.ts packages/host/src/sessions.test.ts --project node
npx vitest run apps/desktop/src/conversations --project desktop
npx vitest run apps/desktop/src/shell/Conversation.test.tsx apps/desktop/src/shell/SessionsList.test.tsx --project desktop
npx vitest run apps/desktop/src/testing/fakeHost.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

The host changes how it drives Pi (a session resumed from its file), so
the gate also runs one real turn, on the Journey the Navigator names and
only then, since it writes to their Mirror:

```bash
npm run turn --workspace packages/host -- --journey <slug> --prompt "Reply with the single word: pong"
```

Expected: every run green; no `console.error`, no violation; the real turn
answers and `mirror conversations` shows it logged on the Journey.

Known before the story: vitest reports one unhandled `ConnectionLostError`
from `apps/desktop/src/testing/fakeHost.test.ts` ("drops every connection
as a dying process does…"), with every test passing. It reproduces on the
lockfile before this story (Pi 1.3.0, Mirror 0.37.0) and is not this
story's; it is not treated as green, and the Debt Review decides where it
is paid.

What the tests will prove, and what they cannot: that the schemas accept
each new message and refuse a malformed one; that the index lists a
folder's files newest first with the title from the head of each, bounds
and cleans the title, skips a file whose head does not parse, names an
unreadable folder, and misses a name set beyond the head, by design; that
the projection turns Pi's entries into transcript entries, fills tool
rows from their results, skips what is hidden or summarizing, bounds
from the end without parting a call from its result, counts the
messages left out, and cuts an oversized entry with a marker; that the
host refuses a file outside the folder (a path, a `..`, a symlink), one
already open, and `sessionFile` without a Journey, and closes a
Journey's open session before opening another; that the store reads the
most recent on pick, keeps a failed list or read, drops a late read,
treats the shown session's pick as a no-op, and sends with the shown
file or none; and that the screen reads, lists, marks, picks, closes on
Escape without stopping a turn, disables its options while running with
the answering line, says the new-session and not-shown lines, and draws
a title as text. They cannot prove that a file terminal Pi wrote reads
back as it was drawn, that resume appends to the same file both ways,
that Mirror opens a new conversation on resume and none on a look, nor
how fast 760 real files index: those are the Navigator's, below.

## E2E Decision

Required. The fake host proves every UI path and the host's tests prove
the index, the projection and the containment on written files; only the
window with real sessions, terminal Pi beside it and `mirror
conversations` as witness, proves the round trip, the Mirror side and
the speed on 760 real files.

## Navigator Validation

In the window (`npm run dev`), on a Journey the Navigator names whose
folder has sessions (the automation Journey served US3), with a terminal
open in that Journey's project path:

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick the Journey | "Reading the session…" for a moment, then its most recent session's transcript, opened at its end, drawn as Pi drew it live: Markdown, tool rows folded, thinking folded; the header's sessions button names the session by its first message and its date; `mirror conversations` in the terminal shows no new conversation |
| 2 | Open the list | "New session" first, then the sessions newest first with title and date, the shown one marked and in view; the same files `pi -r` lists in that project, in the same order |
| 3 | Pick an older session, then the most recent again, then the most recent once more | Each pick shows its own transcript; the third changes nothing; `mirror conversations` still shows no new conversation |
| 4 | Quit any terminal Pi on that session, then send a message on the shown session | The answer follows the read transcript; the header shows the model and thinking level from the file; `mirror conversations` shows a new conversation on the Journey (the file's old one had ended); the session file in `~/.pi/agent/sessions/<project>/` grew |
| 5 | In the terminal run `pi -r` and pick that session | The message sent from the desktop and its answer are in the terminal's transcript; send one line there and quit |
| 6 | Back in the app, open the list and pick the same session again | The line sent from the terminal is at the end of the transcript |
| 7 | Ask for a long answer; while it streams, open the list | Its options are disabled and the line says Pi is answering; Escape closes the list and the answer goes on; a second Escape, list closed, stops it as in US3 |
| 8 | With the session open and idle, pick "New session"; send a line | The new-session line first; the send opens a new session and the button names it; `mirror conversations` shows the previous conversation ended and a new one begun |
| 9 | Pick a Journey whose folder has no sessions | The new-session line, and the button says "New session" |
| 10 | Pick the `mirror` Journey (760 sessions, the largest file 75 MB) | The most recent session shows within one second; the list opens within one second; a session with more than 200 entries opens at its end with "Earlier history in this session is not shown (n messages)" at its top |

**Pass:** every observation holds. **Fail:** any does not; or picking a
Journey or a session writes a Mirror conversation or closes one; or a
session resumed here is not continued by `pi -r`; or Escape on the open
list stops a turn; or the `mirror` Journey takes more than a second to
list or show.

## Validation Evidence

Pending implementation and validation.
