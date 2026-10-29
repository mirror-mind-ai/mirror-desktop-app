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
  it returns, so the rest of the host's open, with its extensions and its
  Journey binding, stands as it is. `getDefaultSessionDir(cwd)` is the
  folder terminal Pi uses for that directory, and `findMostRecentSession`
  is Pi's own "most recent", by file time. 1.4.0 also fixed resumed
  sessions leaving extension tools inactive, which a 1.3.0 resume would
  have hit.
- **Pi's own listing is too heavy for a pick.** `SessionManager.list(cwd)`
  reads every file whole to build `allMessagesText`. Measured on the
  Navigator's machine: the `mirror` Journey's folder holds 760 sessions
  and 1.7 GB, the largest file 75 MB, and `list()` took 2.9 s and
  366 MB of memory; the desktop app's own folder, 10 sessions, took 7 ms.
  Terminal Pi pays the same on `/resume`, behind a progress line.
- **Mirror continues nothing it has closed, by design.** In Mirror 0.38.0
  both `getOrCreateSessionConversation` (`conversation/logger.ts`, the
  logger's first prompt) and `bindConversationContext`
  (`mirror/orchestration.ts`, what `mirror mirror load --session-id` runs)
  check `ended_at`: a session file whose conversation ended gets a new
  Mirror conversation, Journey-bound, on the same file. A `pi -r` in the
  terminal does exactly this today. So resume needs nothing from the
  core, and no Core-owned prerequisite.
- **A session file is JSONL Pi can parse for us.** The first line is the
  header (`type: "session"`, `id`, `timestamp`, `cwd`); messages are
  `message` entries carrying Pi's own `UserMessage`, `AssistantMessage`
  (text, thinking and tool-call blocks, `stopReason`, `errorMessage`),
  `ToolResultMessage` and `BashExecutionMessage`; around them live
  `custom_message` (hidden or shown), `compaction`, `branch_summary`,
  model and thinking changes, labels and `session_info` names.
  `parseSessionEntries`, `getBranch()` and `CURRENT_SESSION_VERSION` are
  exported.
- **The UI's transcript is built from events.** `reduceRows` in
  `conversations/transcript.ts` folds `SessionEvent`s into `Row`s: user,
  assistant (text, thinking, done, stopReason), tool, notice, diagnostic.
  The rows are data; `src/transcript/` draws them. A transcript read from
  a file needs rows, not a replay of deltas.
- **The fake host scripts Journeys, models, turns and failures**
  (`testing/fakeHost.ts`, `worlds.ts`); it knows no sessions on disk, and
  its `session.open` mints an id per open.
- **The header is where a conversation says where it is.** `Conversation.tsx`
  shows the Journey's name, the project path, and once open the model and
  thinking level. `useEscapeToStop` carries the overlay rule from US3:
  anything closable that takes Escape prevents the default, and Escape
  then does not stop a turn.

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | Which sessions a Journey lists | **The folder's, as terminal Pi lists them.** Every `.jsonl` in `getDefaultSessionDir(projectPath)` whose header `cwd` is the project path; not filtered by the Journey Mirror bound each to. It is the story's own words ("the same list from terminal Pi, because they are the same files") and D7's. A terminal session that never ran Mirror appears too; two Journeys sharing a project path share a list. *Alternative:* keep only sessions Mirror bound to this Journey, by `runtime_sessions`: a shorter list that differs from the terminal's, and hides the terminal sessions the person most wants to continue. |
| D2 | How the list is read | **A light index in the host, not `SessionManager.list()`.** `packages/host/src/sessionIndex.ts`: `readdir`, `stat` each file, read the head of each (the first 64 KB, complete lines only, through Pi's `parseSessionEntries`), keep the header's `id` and `timestamp`, the file's modified time, and a title: the `session_info` name if one is in the head, else the first line of the first user message, else "Untitled session". Sorted by modified time, newest first. The most recent is the first row; `findMostRecentSession` orders the same way. Message counts are not shown: they need the whole file, and the story names a title and a date. A name set later than the head is missed, said in the module's comment. *Alternative:* Pi's `list()` behind a "Loading sessions…" line, 3 s and 366 MB on the biggest Journey at every pick. |
| D3 | Showing a session without opening it | **`session.transcript { sessionFile }`, a read.** The host opens the file with `SessionManager.open(file, undefined, cwd)`, takes `getBranch()` from the leaf, and projects the entries onto protocol `TranscriptEntry`s: `user` (text), `assistant` (text, thinking, `stopReason`, `errorMessage`), `tool` (`toolCallId`, name, args, result text, `isError`), each tool row filled by its `toolResult`; a `bashExecution` is a tool row named `bash`; a `custom_message` with `display: true` is a notice named by its `customType`, a hidden one is skipped; compaction and branch summaries are skipped, since the file keeps the messages they summarize. **Bounded:** the last 200 entries, with `earlier: n` for what was left; the transcript then opens with one muted line, "n earlier messages in this session are not shown." The UI maps entries to `Row`s in `conversations/transcript.ts` (`rowsOf`), every row done. Selecting a Journey still writes nothing: two reads (D14 holds). *Alternative:* replay the file as `SessionEvent`s through `reduceRows`, which makes a whole message a delta; or the whole branch, tens of MB over the socket for the 75 MB file. |
| D4 | Resuming | **`session.open` gains an optional `sessionFile`.** With it the host refuses a file outside the Journey's session folder (`session_open_failed`, "not one of the Journey's sessions") and otherwise builds the manager with `SessionManager.open(sessionFile, undefined, cwd)`; everything after is today's open: the Mirror package loaded, `bindExtensions` (the logger's `session_start`, which reorients and names the session), `mirror mirror load --journey --session-id`, which binds a new Mirror conversation to the file because the old one ended. The result carries the file's own session id. Pi appends to the same file, so terminal Pi's `pi -r` sees what the desktop added. |
| D5 | Where the list lives | **In the conversation header.** A button after the Journey's name showing the shown session's title and date ("Change to journey mirror-desktop · Oct 29"), or "New session" when one is chosen; it opens a list below the header: "New session" first, then the sessions newest first, each with its title and date, the shown one marked. `role="listbox"` with options, arrow keys and Enter, Escape closes it with the default prevented (the overlay rule, so a turn is not stopped), a click outside closes it. "where the Journey is" read as the Journey's own screen; the sidebar stays the Journeys. *Alternative:* the sessions nested under the Journey in the sidebar: two levels of navigation in one list, and 760 rows under one Journey. |
| D6 | Picking a session, and "New session" | **One open session per Journey at a time; picking replaces it.** While a turn runs the list is disabled, its title saying to wait for the answer or stop it. With an open idle session, picking another, or "New session", first asks the host to `session.close` it (Mirror's `session_shutdown` closes its conversation, as a quit does), then shows the pick. A pick shows that session's transcript, read from its file; "New session" shows an empty transcript with the line "A new session in ~/garden. The first message starts it." The first send then resumes the file, or opens a new session with no file, through the one `send()`; what follows is today's conversation. A `session.close` that fails is said in a toast and the pick stands: the next send opens anyway. *Alternative:* keep every picked session open until quit: several Mirror conversations open per Journey, and TS1's quit has more to close. |
| D7 | The conversation's state | **`Conversation` learns which session it shows.** `sessions`: `{ status: "loading" \| "loaded" \| "failed", list, failure? }`, read when the Journey is first picked and after every open or close; `shown`: `{ kind: "file", file, title, modified } \| { kind: "new" }`, the most recent by default, `new` when the folder is empty. `rows` hold the read transcript, then the live turn's rows after it. `selectJourney` stays pure for the current marker; `showJourney(client, id)` lists, chooses the most recent and reads it, through the `epoch` guard the store already has. A read that fails leaves the conversation usable: the transcript area says "The sessions in ~/garden could not be read.", the host's words in mono, and "Try again"; the composer still sends, which opens a new session. |
| D8 | The protocol | **Three additions and a bump.** `sessions.list { journey }` → `{ sessions: SessionSummary[] }` (`file`, `id`, `title`, `created`, `modified`); `session.transcript { journey, sessionFile }` → `{ entries, earlier }`; `sessionFile?` on `session.open`. `PROTOCOL_VERSION` 0.4.0 → 0.5.0: a UI with these requests facing a host without them gets `malformed_request`, which the hello check turns into one plain refusal instead. Both ship together in the bundle. |
| D9 | The fake host | **Worlds script sessions.** `serveFakeHost({ sessions: { garden: [...] } })`, each scripted session with `file` (under `/Users/test/`), `id`, `title`, `created`, `modified` and `entries`; `sessions.list` and `session.transcript` answer from the script (a Journey with none lists `[]`); `session.open` with a scripted `sessionFile` answers with that session's id, with an unscripted one a violation; `session.close` is answered for an open session, and a close is recorded so a test can assert it. `worlds.ts` gains Garden's two sessions and leaves Beds with none. The fixture rules hold: invented text, no real paths. |
| D10 | Mirror | **Nothing changes in the core; one fact is recorded.** A resumed session gets a new Mirror conversation, bound to the Journey, as a terminal `pi -r` does; the ended one keeps its title, summary and memories. The index's comment says it, and D7's decision gets a line at Done so the premise is written where it is read. |
| D11 | TD-004 and the Planning Inputs | **US1 builds the read TS1 needs and pays nothing of TD-004.** Planning Input 2 (a connection starts from the current view): `session.transcript` is that view for a session no turn is running; TS1 decides what a reconnected UI reads first, and US2 what a turn in flight adds. Inputs 1 and 3 (a send carries an id; every queued message has a fate) are not US1's. TD-004 stays open with its trigger (TS1): nothing reconnects yet, and the stale-session answer, "drop the session, keep the rows, resume from the file", is now possible, which the ledger entry gets as a note at Done. |

## Scope

1. **The protocol** (D8): `SessionSummary`, `TranscriptEntry`, the two
   requests and results, `sessionFile` on `session.open`, the version bump;
   schema tests in `packages/protocol/src/index.test.ts` for each new
   message and for a refused `session.transcript` without a Journey.

2. **The host's session index** (D2): `packages/host/src/sessionIndex.ts`,
   `listSessions(cwd)` and the head reader, tested in `sessionIndex.test.ts`
   against files written into a temp directory: a header with no messages,
   a first user message with a string and with blocks, a `session_info`
   name in the head, a name beyond the head (missed, by design), a file of
   another cwd (skipped), an unreadable file (skipped, logged), order by
   modified time.

3. **The host's transcript read** (D3): `projectTranscript(entries, limit)`
   in `packages/host/src/transcript.ts`, tested in `transcript.test.ts`
   with entries written inline: a user and an assistant turn with a tool
   call and its result, a hidden and a shown custom message, a compaction,
   a bash execution, an assistant with an `errorMessage`, and the bound
   with `earlier`. `SessionRegistry.readTranscript(cwd, file)` opens and
   reads; the server answers `sessions.list` and `session.transcript`.

4. **Resume in the host** (D4): `OpenSessionRequest.sessionFile`, the
   folder check, `SessionManager.open`; the server passes it through. The
   registry is tested as the shutdown test tests it, with a stubbed Pi
   where it can be, and otherwise by the real turn of the validation route.

5. **The conversations store** (D6, D7): `sessions` and `shown` on
   `Conversation`, `showJourney`, `chooseSession`, `startNewSession`,
   `rowsOf` in `transcript.ts`, `send` passing `shown.file`; tests in
   `store.test.ts` and `transcript.test.ts` against a stub connection:
   the most recent chosen and read on pick, `new` on an empty folder, the
   read's failure kept, a pick closing the open session, a pick refused
   while running, a send resuming the shown file and opening with none
   after "New session", events routed by the resumed session's id, and
   the list re-read after an open.

6. **The header's sessions list** (D5): `shell/SessionsList.tsx`, mounted
   in `Conversation.tsx`'s header; the empty-transcript line for a new
   session and the "not shown" line for a bounded transcript; the failed
   read's words and Try again. UI tests in `Conversation.test.tsx` and
   `SessionsList.test.tsx` against the fake host: Garden picked shows its
   most recent session's rows and the button says its title; the list
   opens newest first with the shown one marked and "New session" first;
   picking the older session shows its rows and the button changes;
   Escape closes the list and stops nothing (a held turn, Escape on the
   open list, no `session.abort`); "New session" shows the line and the
   first send opens with no file; a send on the shown session opens with
   its file and the turn's rows follow the read ones; the list is disabled
   while the turn runs; picking with an open idle session sends
   `session.close`; Beds, with no sessions, shows the new-session line and
   its button says "New session".

7. **The fake host** (D9): `sessions` in the world, the three answers and
   the close record, with tests in `fakeHost.test.ts`; `worlds.ts`.

8. **Docs.** `AGENTS.md`'s shape and rules where they say one session per
   Journey; D7 and D14 extended with one paragraph each at Done; this
   story's index and the CV1.DS2 candidate table at Done; the worklog; the
   TD-004 note (D11); the comments at the top of `sessions.ts`,
   `conversations/store.ts` and `fakeHost.ts`, which describe what each
   is.

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
- Images in a read transcript: shown as their alt text or skipped, as the
  live transcript shows them (D16); no image rendering.

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
Then the transcript shows that session, read from its file, the button names it, and nothing was opened
And if a session was open and idle for this Journey, the host was asked to close it first

Given a session shown and not open
When the person sends a message
Then the host resumes that session file, the turn's rows follow the read transcript, and the resumed session's id routes the events
And a session resumed here can be continued in terminal Pi with `pi -r`, and one begun there appears here and continues

Given the Journey on screen
When the person picks "New session"
Then the transcript is empty with the line "A new session in ~/garden. The first message starts it."
And the first send opens a session with no file, as today

Given a Journey whose folder has no sessions
When the person picks it
Then the transcript shows the new-session line and the button says "New session"

Given a session with more than 200 entries on its branch
When it is shown
Then the last 200 are drawn, with one muted line saying how many earlier messages are not shown

Given a turn running in the Journey on screen
When the person looks at the sessions button
Then it is disabled and says to wait for the answer or stop it

Given the host cannot read the Journey's sessions
When the Journey is picked
Then the transcript area says the sessions could not be read, shows the host's words, and offers Try again
And the composer still sends, which opens a new session
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
whose folder has sessions (the automation Journey served US3):

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick the Journey | Its most recent session's transcript is drawn as Pi drew it live: Markdown, tool rows folded, thinking folded; the header's sessions button names the session by its first message and its date; `mirror conversations` in a terminal shows no new conversation |
| 2 | Open the list | "New session" first, then the sessions newest first with title and date, the shown one marked; the same files `pi -r` lists in that project |
| 3 | Pick an older session, then the most recent again | Each shows its own transcript; nothing opens; `mirror conversations` still shows no new conversation |
| 4 | Send a message on the shown session | The answer follows the read transcript; the header shows the model and thinking level from the file; `mirror conversations` shows a new conversation on the Journey; the session file in `~/.pi/agent/sessions/<project>/` grew |
| 5 | In a terminal, in the project path, run `pi -r` and pick that session | The message sent from the desktop and its answer are in the terminal's transcript; send one line there and quit |
| 6 | Back in the app, open the list and pick the same session again | The line sent from the terminal is at the end of the transcript |
| 7 | While an answer streams, look at the sessions button; press Escape with the list closed | The button is disabled with the waiting hint; Escape stops the turn as in US3 |
| 8 | With the session open and idle, pick "New session"; send a line | The transcript emptied to the new-session line first; the send opens a new session; `mirror conversations` shows the previous conversation ended and a new one begun |
| 9 | Open the list and press Escape while a turn streams in the new session | The list closes and the turn goes on |
| 10 | Pick a Journey whose folder has no sessions (a fresh project path, or `pears`-like) | The new-session line, and the button says "New session" |
| 11 | Pick the `mirror` Journey (760 sessions) | The most recent session shows within a moment, not seconds; the list opens within a moment |

**Pass:** every observation holds. **Fail:** any does not; or picking a
Journey or a session writes a Mirror conversation; or a session resumed
here is not continued by `pi -r`; or Escape on the open list stops a turn;
or the `mirror` Journey takes seconds to show.

E2E decision: required. The fake host proves every path in the UI, and
the host's tests prove the index and the projection on written files, but
only the window with real sessions proves that a file terminal Pi wrote
reads back as it was drawn, that resume appends to the same file both
ways, and that Mirror opens a new conversation on resume and none on a
look.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS2.US1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- No new dependency. No change to the Mirror core or `apps/desktop/src-tauri`.
- The protocol first, then the host, then the UI, as AGENTS.md orders a
  new capability. Slices, each committed green: (1) the protocol; (2) the
  session index; (3) the transcript projection and read; (4) resume in
  the host; (5) the fake host's sessions and worlds; (6) the store;
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
- Mirror's binding on resume does not create a new conversation as the
  source reads (checked at validation step 4; if so, a Core-owned
  prerequisite, not a local fork)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
