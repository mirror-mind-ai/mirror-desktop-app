[< Story](index.md)

# Plan — CV1.DS2.US1

## Objective

Make a Journey's conversations its Pi sessions, many of them, as
[D7](../../../../decisions.md#d7--conversations-are-pi-sessions-many-per-journey)
decided and nothing yet shows: picking a Journey shows its most recent
session, read from the session file; the Journey's sessions are listed
newest first with a title and a date; one of them can be picked, or a new
one started; and the first send resumes what is shown, so a session begun
in terminal Pi continues in the desktop and the other way round. This is
the first story of CV1.DS2 and the ground TS1 (a restart that reconnects)
and TD-004 (what the UI does with a session across hosts) stand on.

Read from the code, not guessed:

- **Every open is a new session.** `SessionRegistry.#open` in
  `packages/host/src/sessions.ts` calls `SessionManager.create(cwd)`; the
  protocol's `session.open` names a Journey or a directory and nothing
  else. The UI (`conversations/store.ts`) keeps one conversation per
  Journey for the app run, opened by the first send (D14) and never
  listed, chosen or replaced.
- **Pi 1.4.0 has what resume needs, as library calls.** `SessionManager.open(file,
  undefined, cwd)` loads a session file and only reads (verified in
  `dist/core/session-manager.js`); `createAgentSession` takes the manager
  it returns and restores the model and thinking level from the file's
  branch (`sdk.js`), so the rest of the host's open, with its extensions
  and its Journey binding, stands as it is. `getDefaultSessionDir(cwd)`
  is the folder terminal Pi uses for that directory. 1.4.0 also fixed
  resumed sessions leaving extension tools inactive, which a 1.3.0
  resume would have hit.
- **Pi's own listing is too heavy for a pick, and shows the whole folder.**
  `SessionManager.list(cwd)` reads every file whole to build
  `allMessagesText`, and on the default folder filters nothing by the
  header's cwd. Measured on the Navigator's machine: the `mirror`
  Journey's folder holds 760 sessions and 1.7 GB, the largest file 75 MB,
  and `list()` took 2.9 s and 366 MB of memory; the desktop app's own
  folder, 10 sessions, took 7 ms. Terminal Pi pays the same on `/resume`,
  behind a progress line. Opening the 75 MB file alone
  (`SessionManager.open` + `getBranch`) took 175 ms and 208 MB, for 1,912
  entries, the largest 1.37 MB.
- **Mirror continues nothing it has closed, by design.** In Mirror 0.38.0
  both `getOrCreateSessionConversation` (`conversation/logger.ts`, the
  logger's first prompt) and `bindConversationContext`
  (`mirror/orchestration.ts`, what `mirror mirror load --session-id` runs)
  check `ended_at`: a session file whose conversation ended gets a new
  Mirror conversation, Journey-bound, on the same file; one whose
  conversation has not ended (a terminal session still open, a host that
  died before `session_shutdown`) is continued, and its `journey` updated
  to the one named. A `pi -r` in the terminal does exactly this today. So
  resume needs nothing from the core, and no Core-owned prerequisite.
- **A session file is JSONL Pi can parse for us.** The first line is the
  header (`type: "session"`, `id`, `timestamp`, `cwd`); messages are
  `message` entries carrying Pi's own `UserMessage`, `AssistantMessage`
  (text, thinking and tool-call blocks, `stopReason`, `errorMessage`),
  `ToolResultMessage` and `BashExecutionMessage` (`command`, `output`,
  `exitCode`); around them live `custom_message` (hidden or shown),
  `compaction`, `branch_summary`, model and thinking changes, labels and
  `session_info` names. `parseSessionEntries`, `getBranch()` and
  `CURRENT_SESSION_VERSION` are exported.
- **The UI's transcript is built from events.** `reduceRows` in
  `conversations/transcript.ts` folds `SessionEvent`s into `Row`s: user,
  assistant (text, thinking, done, stopReason), tool, notice, diagnostic.
  The rows are data; `src/transcript/` draws them, and opens at the
  bottom. A transcript read from a file needs rows, not a replay of
  deltas.
- **The server's error mapping is closed.** `failureOf` in `server.ts`
  maps the typed session and Mirror failures to named codes and anything
  else to `internal_failure` with fixed words; the protocol's `HostError`
  carries no raw exceptions or paths.
- **The fake host scripts Journeys, models, turns and failures**
  (`testing/fakeHost.ts`, `worlds.ts`); it knows no sessions on disk, its
  `session.open` mints an id per open, and `checkWorld` runs the fixture
  net (`FORBIDDEN_CONTENT`, real paths) over turns only.
- **The header is where a conversation says where it is.** `Conversation.tsx`
  shows the Journey's name, the project path, and once open the model and
  thinking level. `useEscapeToStop` carries the overlay rule from US3:
  anything closable that takes Escape prevents the default, and Escape
  then does not stop a turn.

This is the second version of the plan, revised after a four-lens review;
see [plan-review.md](plan-review.md). R1–R3 there carry the Driver's
recommendation below until the Navigator rules.

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | Which sessions a Journey lists | **The folder's, as terminal Pi lists them** (R3, recommended): every `.jsonl` in `getDefaultSessionDir(projectPath)` with a readable header, not filtered by the header's cwd (Pi's own list does not filter on this folder) nor by the Journey Mirror bound each to. It is the story's own words ("the same list from terminal Pi, because they are the same files") and D7's. Two consequences, accepted and written here: a terminal session that never ran Mirror appears; and two Journeys sharing a project path share a list, so resuming one Journey's session under the other binds its next Mirror conversation to the other (the same file open under both at once is refused, D4). *Alternative:* keep only sessions Mirror bound to this Journey, by `runtime_sessions`: a shorter list that differs from the terminal's, and hides the terminal sessions the person most wants to continue. |
| D2 | How the list is read | **A light index in the host, not `SessionManager.list()`.** `packages/host/src/sessionIndex.ts`: `readdir`, `stat` each file, read the head of each (the first 64 KB, complete lines only, through Pi's `parseSessionEntries`), keep the header's `id` and `timestamp`, the file's modified time, and a title: the `session_info` name if one is in the head, else the first line of the first user message, else "Untitled session"; the title is bounded to 120 characters and stripped of control and bidi characters, since it is content a model or a tool can write and it is drawn in the header. Sorted by modified time, newest first; **the most recent is the first row**, the same rule for both. A file whose head does not parse is skipped and logged to stderr. Message counts are not shown: they need the whole file, and the story names a title and a date. A name set later than the head is missed, said in the module's comment. *Alternative:* Pi's `list()` behind a "Loading sessions…" line, 3 s and 366 MB on the biggest Journey at every pick. |
| D3 | Showing a session without opening it | **`session.transcript { journey, sessionFile }`, a read.** The host checks containment (D4), opens the file with `SessionManager.open(file, undefined, cwd)`, takes `getBranch()` from the leaf, and projects the entries onto protocol `TranscriptEntry`s: `user` (text; an image is its alt text, as D16 draws it live), `assistant` (text, thinking, `stopReason`, `errorMessage`), `tool` (`toolCallId`, name, args, result text, `isError`), each tool row filled by its `toolResult`; a `bashExecution` is a tool row named `bash` with its command as args, its output as result and a non-zero exit as `isError`; a `custom_message` with `display: true` is a notice named by its `customType`, a hidden one is skipped; compaction and branch summaries are skipped, since the file keeps the messages they summarize. **Bounded twice:** the last 200 drawable entries after projection, never splitting a tool call from its result, with `earlier: n` counting the user and assistant messages left out; and every text, thinking and result capped at 64 KB with a marker where it was cut, since one entry measured 1.37 MB. The transcript then opens with one muted line, "Earlier history in this session is not shown (n messages)." The whole-file load per look is an accepted cost: 175 ms and 208 MB, transient, on the largest file known. The UI maps entries to `Row`s in `conversations/transcript.ts` (`rowsOf`), every row done. Selecting a Journey still writes nothing: two reads (D14 holds). *Alternative:* replay the file as `SessionEvent`s through `reduceRows`, which makes a whole message a delta; or the whole branch, tens of MB over the socket for the 75 MB file. |
| D4 | Resuming, and the folder check | **`session.open` gains an optional `sessionFile`, and one open session per Journey is the host's invariant** (R1, recommended). `sessionFile` requires a `journey`; without one it is refused. Containment, for `session.transcript` and `session.open` alike: both the file and `getDefaultSessionDir(projectPath)` resolved through `realpath`, the file strictly inside the folder, a regular `.jsonl`; otherwise `session_open_failed`, "not one of the Journey's sessions". A file whose session id is already open, under any Journey, is refused the same way ("already open"). Then the host builds the manager with `SessionManager.open(sessionFile, undefined, cwd)`; everything after is today's open: the Mirror package loaded, `bindExtensions` (the logger's `session_start`), `mirror mirror load --journey --session-id`, which binds a new Mirror conversation when the file's old one ended and continues it when it has not. **Before opening for a Journey, the host closes that Journey's open session, if any**, in the same request, so a Journey never has two: the UI asks for nothing but the open, and a pick (D6) is a pure look. The result carries the file's own session id and the open's diagnostics. Pi appends to the same file, so terminal Pi's `pi -r` sees what the desktop added. |
| D5 | Where the list lives | **In the conversation header.** A button after the Journey's name, in the muted weight, showing the shown session's title (bounded with an ellipsis) and its modified date, absolute and short ("Oct 29", the year when not this one), with a chevron; "New session" when that is chosen; "Sessions…" while the list is being read. It opens a list below the header, `role="listbox"`: "New session" first, then the sessions newest first, each a title and a date, the shown one marked and scrolled into view, the list bounded in height and scrolling; arrow keys and Enter pick, Escape closes it with the default prevented (the overlay rule, so a turn is not stopped), a click outside closes it. Titles are text nodes, never Markdown. "where the Journey is" read as the Journey's own screen; the sidebar stays the Journeys, one level of navigation per place. *Alternative:* the sessions nested under the Journey in the sidebar: two levels of navigation in one list. |
| D6 | Picking a session, and "New session" | **A pick shows; the send acts.** Picking a session reads its transcript and shows it; picking the shown one is a no-op; "New session" shows an empty transcript with the line "A new session in ~/garden. The first message starts it." Nothing is opened or closed by a pick (D4 closes the Journey's open session when the next send opens another). While a turn runs the list opens, but its options are disabled and a line in it says "Pi is answering. Pick a session when it finishes." (R2, recommended); Escape closes it and the turn goes on. The first send resumes the shown file, or opens a new session with no file, through the one `send()`; what follows is today's conversation, its diagnostics placed where the live turn begins, after the read rows. *Alternative:* the button disabled while running, the hint in its `title`, which a disabled control never shows to a keyboard. |
| D7 | The conversation's state | **`Conversation` learns which session it shows.** `sessions`: `{ status: "loading" \| "loaded" \| "failed", list, failure? }`, read when the Journey is first picked and after every open; `shown`: `{ kind: "file", file, title, modified } \| { kind: "new" }`, the most recent by default, `new` when the folder is empty; `transcript`: `{ status: "reading" \| "read" \| "failed", failure? }`. `rows` hold the read transcript, then the live turn's rows after it. `selectJourney` stays pure for the current marker; `showJourney(client, id)` lists, chooses the most recent and reads it; `chooseSession` and `startNewSession` read or clear. Every read carries a per-conversation token, so an answer that lands after a later pick is dropped; the `epoch` guard covers resets only. While reading, the transcript area shows a Pulse with "Reading the session…". A list or a read that fails leaves the conversation usable: the area says "The sessions in ~/garden could not be read." or "This session could not be read.", the host's words in mono, and "Try again"; the composer still sends, which resumes the shown file anyway (the head reader failing does not prove Pi's parse fails) or opens a new session. After an open, the list is re-read and the button names the opened session. |
| D8 | The protocol | **Three additions, one error code, and a bump.** `sessions.list { journey }` → `{ sessions: SessionSummary[] }` (`file`, `id`, `title`, `created`, `modified`); `session.transcript { journey, sessionFile }` → `{ entries, earlier }`; `sessionFile?` on `session.open`; `sessions_unreadable` in `HostError`, with a host-composed message naming what failed and the folder, never a raw exception. `PROTOCOL_VERSION` 0.4.0 → 0.5.0: zod strips an unknown field, so an old host given `sessionFile` would silently open a fresh session; the hello check is the guard, and turns the mismatch into one plain refusal. Both ship together in the bundle. |
| D9 | The fake host | **Worlds script sessions, under the fixture net.** `serveFakeHost({ sessions: { garden: [...] } })`, each scripted session with `file` (under `/Users/test/`), `id`, `title`, `created`, `modified` and `entries`; `checkWorld` runs the forbidden-content and real-path checks over scripted entries, titles and files, as it does over turns. `sessions.list` and `session.transcript` answer from the script (a Journey with none lists `[]`); `session.open` with a scripted `sessionFile` answers with that session's id and closes the Journey's open session as the real host does, recording the close so a test can assert it; an unscripted file is a violation. `worlds.ts` gains Garden's two sessions and leaves Beds with none. |
| D10 | Mirror | **Nothing changes in the core; one fact is recorded, qualified.** A resumed session whose conversation ended gets a new Mirror conversation bound to the Journey, as a terminal `pi -r` does, and the ended one keeps its title, summary and memories; a session whose conversation is still open (open in a terminal, or left by a host that died) is continued and re-journeyed, which `pi -r` would do too. The index's comment says it, and D7's decision gets a line at Done so the premise is written where it is read. |
| D11 | TD-004 and the Planning Inputs | **US1 builds the read TS1 needs and pays nothing of TD-004.** Planning Input 2 (a connection starts from the current view): `session.transcript` is that view for a session no turn is running; TS1 decides what a reconnected UI reads first, and US2 what a turn in flight adds. Inputs 1 and 3 (a send carries an id; every queued message has a fate) are not US1's. TD-004 stays open with its trigger (TS1): nothing reconnects yet, and the stale-session answer, "drop the session, keep the rows, resume from the file", is now possible, which the ledger entry gets as a note at Done. |

## Scope

1. **The protocol** (D8): `SessionSummary`, `TranscriptEntry`, the two
   requests and results, `sessionFile` on `session.open`,
   `sessions_unreadable`, the version bump; schema tests in
   `packages/protocol/src/index.test.ts` for each new message, for a
   refused `session.transcript` without a Journey, and for the cap
   marker's shape.

2. **The host's session index** (D2): `packages/host/src/sessionIndex.ts`,
   `listSessions(cwd)` and the head reader, tested in `sessionIndex.test.ts`
   against files written into a temp directory: a header with no messages,
   a first user message with a string and with blocks, a `session_info`
   name in the head, a name beyond the head (missed, by design), a title
   with control characters (stripped) and over the bound (cut), a file
   whose head does not parse (skipped, logged), an unreadable directory
   (`sessions_unreadable`), order by modified time, and the first row as
   the most recent.

3. **The host's transcript read** (D3): `projectTranscript(entries, limit, cap)`
   in `packages/host/src/transcript.ts`, tested in `transcript.test.ts`
   with entries written inline: a user and an assistant turn with a tool
   call and its result, a hidden and a shown custom message, a compaction,
   a bash execution, an assistant with an `errorMessage`, an image as alt
   text, the bound with `earlier` counting messages and never splitting a
   call from its result, and an oversized result cut with the marker.
   `SessionRegistry.readTranscript(journey, file)` checks containment,
   opens and reads; the server answers `sessions.list` and
   `session.transcript`.

4. **Resume in the host** (D4): `OpenSessionRequest.sessionFile`, the
   containment check (`containedSessionFile(cwd, file)`, shared with the
   read), the already-open refusal, closing the Journey's open session
   before opening, `SessionManager.open`; the server passes it through.
   Tests in `sessions.test.ts`, with Pi stubbed where it can be and the
   registry's real code around it: `..` out of the folder, a symlink out,
   another cwd's folder, a listed file deleted before the open, a file
   already open under another Journey, and a second open for a Journey
   closing the first. The real turn of the validation route covers what
   a stub cannot.

5. **The fake host** (D9): `sessions` in the world, the three answers, the
   close on open and its record, the fixture net over scripted sessions,
   with tests in `fakeHost.test.ts`; `worlds.ts`.

6. **The conversations store** (D6, D7): `sessions`, `shown` and
   `transcript` on `Conversation`, `showJourney`, `chooseSession`,
   `startNewSession`, the read token, `rowsOf` in `transcript.ts`, `send`
   passing `shown.file` and placing diagnostics after the read rows;
   tests in `store.test.ts` and `transcript.test.ts` against a stub
   connection: the most recent chosen and read on pick, `new` on an empty
   folder, a list failure and a read failure each kept, a late read
   dropped after a later pick, picking the shown session a no-op, a send
   resuming the shown file and opening with none after "New session", a
   send after a failed read resuming anyway, events routed by the resumed
   session's id, the list re-read after an open and the button's name
   following it.

7. **The header's sessions list** (D5, D6): `shell/SessionsList.tsx`,
   mounted in `Conversation.tsx`'s header; the reading, new-session and
   not-shown lines; the failed read's words and Try again. UI tests in
   `Conversation.test.tsx` and `SessionsList.test.tsx` against the fake
   host: Garden picked shows "Reading the session…" then its most recent
   session's rows and the button says its title and date; the list opens
   newest first with the shown one marked, "New session" first; picking
   the older session shows its rows and the button changes; picking the
   shown one changes nothing; Escape closes the list and, with a held
   turn running, sends no `session.abort`; the list open during a held
   turn has its options disabled and the answering line; "New session"
   shows the line and the first send opens with no file; a send on the
   shown session opens with its file, the turn's rows follow the read
   ones, and the Journey's previously open session was closed by the
   open; a scripted list failure shows the words and Try again, and a
   send still opens; Beds, with no sessions, shows the new-session line
   and its button says "New session"; a title with Markdown syntax is
   drawn as text.

8. **Docs.** `AGENTS.md`'s shape and rules where they say one session per
   Journey and describe the fake host; D7 and D14 extended with one
   paragraph each at Done; this story's index and the CV1.DS2 candidate
   table at Done; the worklog; the TD-004 note (D11); the comments at the
   top of `sessions.ts`, `conversations/store.ts` and `fakeHost.ts`,
   which describe what each is.

## Non-Goals

- Steering, follow-up and Stop's effect on the turn: CV1.DS2.US2.
- Choosing the model or thinking level: CV1.DS2.US3. A resumed session
  keeps what its file says; the header shows it once open, as today.
- Reconnecting a UI to a new host, reopening the last Journey on restart,
  and settling TD-004: CV1.DS2.TS1 (D11).
- Renaming, deleting, forking or branching a session, a search over
  sessions, and loading the earlier messages a bounded transcript left
  out: later, when a screen needs them (D7 names Pi's `SessionManager`
  for branching).
- Message counts in the list, and Mirror's conversation titles as session
  titles: the first needs the whole file, the second belongs to CV4
  Mirror Surfaces, where Mirror's view of a conversation is drawn.
- Detecting that terminal Pi has the same session open: Pi has no lock
  and `pi -r` twice has the same exposure; named as a risk, not solved.
- Any change to the Mirror core (D10), to the Rust shell, or to sign-in.
- Rendering images in a read transcript: alt text, as the live transcript
  (D16).

## Acceptance Behavior

```text
Given a Journey with sessions in its folder, none open in the app
When the person picks it in the sidebar
Then the transcript says "Reading the session…", then shows its most recent session read from the file, opened at its end, with no session opened and nothing written to Mirror
And the header's sessions button names that session's title and modified date

Given the Journey on screen
When the person opens the sessions list
Then it lists "New session" first, then the Journey's sessions newest first, each with its title and date, the shown one marked and in view
And Escape closes the list without stopping a running turn

Given the sessions list open
When the person picks an older session
Then the transcript shows that session, read from its file, the button names it, and nothing was opened or closed
And picking the session already shown changes nothing

Given a session shown and not open
When the person sends a message
Then the host resumes that session file, closing the Journey's previously open session first if there was one, the turn's rows follow the read transcript, and the resumed session's id routes the events
And a session resumed here can be continued in terminal Pi with `pi -r`, and one begun there appears here and continues

Given the Journey on screen
When the person picks "New session"
Then the transcript is empty with the line "A new session in ~/garden. The first message starts it."
And the first send opens a session with no file, and the button then names the opened session

Given a Journey whose folder has no sessions
When the person picks it
Then the transcript shows the new-session line and the button says "New session"

Given a session with more drawable entries than the bound
When it is shown
Then the last 200 are drawn, a tool call never parted from its result, with one muted line saying how many earlier messages are not shown
And an entry's text over the cap is cut with a marker where it was cut

Given a turn running in the Journey on screen
When the person opens the sessions list
Then its options are disabled and a line says Pi is answering and to pick a session when it finishes
And Escape closes the list and the turn goes on

Given the host cannot read the Journey's sessions, or the shown session's file
When the Journey or the session is picked
Then the transcript area says so, shows the host's words, and offers Try again
And the composer still sends, which resumes the shown file or opens a new session

Given a sessionFile outside the Journey's folder, by a path, a `..` or a symlink, or one already open under another Journey
When the UI asks to show or resume it
Then the host refuses by name and opens nothing
```

## Validation Route

Automated, from the repository root: the gate (`npm run typecheck`,
`npm test`, `npm run build`, `git diff --check`) and the story's tests as
[test-guide.md](test-guide.md) lists them. The host changes how it drives
Pi, so the gate includes one real turn through the host on a Journey the
Navigator names (`npm run turn --workspace packages/host -- --journey
<slug> --prompt "…"`), and `cargo check` is not in the gate since the
shell does not change. The pre-existing unhandled `ConnectionLostError`
vitest reports from `fakeHost.test.ts` is recorded in the test guide; it
predates this story and is not treated as green.

Navigator, in the window (`npm run dev`), on a Journey the Navigator names
whose folder has sessions (the automation Journey served US3), with a
terminal open in that Journey's project path:

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

E2E decision: required. The fake host proves every path in the UI, and
the host's tests prove the index, the projection and the containment on
written files, but only the window with real sessions proves that a file
terminal Pi wrote reads back as it was drawn, that resume appends to the
same file both ways, that Mirror opens a new conversation on resume and
none on a look, and how fast 760 real files index.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS2.US1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- No new dependency. No change to the Mirror core or `apps/desktop/src-tauri`.
- The protocol first, then the host, then the UI, as AGENTS.md orders a
  new capability. Slices, each committed green: (1) the protocol; (2) the
  session index; (3) the transcript projection and read, with
  containment; (4) resume in the host, with the close-before-open and the
  refusals; (5) the fake host's sessions and worlds; (6) the store;
  (7) the header's list and the transcript lines, with the UI tests;
  (8) the docs and comments.
- A real turn runs only on the Journey the Navigator names, at validation.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- `SessionManager.open` or `createAgentSession` writes to, renames or
  re-homes a file on open (none seen in 1.4.0's source; checked again when
  the first resume test runs)
- the head of a real session file does not carry its first user message
  within 64 KB in a share of files that makes titles useless (measured on
  the Navigator's folders in slice 2; the bound is then raised or the
  title rule changed, and said here)
- Mirror's binding on resume does not behave as its source reads (checked
  at validation step 4; if so, a Core-owned prerequisite, not a local
  fork)
- closing a Journey's open session inside `session.open` cannot be made
  safe against a turn running in it (the UI refuses a pick's send while
  running, but the host must refuse too: `session_busy` if the session
  to be closed is streaming)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval; R1–R3 in
  [plan-review.md](plan-review.md) await the Navigator's rulings and the
  plan carries the recommended option for each.
