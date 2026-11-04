[< Story](index.md)

# Plan — CV1.DS2.US2

## Objective

Let a running turn be shaped and ended from the app the way terminal Pi
allows: a message sent while Pi answers is queued as a steer (Enter) or a
follow-up (Option+Enter), the queue is visible until Pi takes each message,
a delivered message enters the transcript where Pi said it, and Stop aborts
cleanly: the partial answer kept and marked, every queued message withdrawn
into the draft, the session and its Mirror conversation intact. On the way,
make the host's `session.prompt` answer honestly, through Pi's own
preflight, so a message Pi refuses comes back to the draft instead of
vanishing into an event. This answers CV1.DS2's Planning Input 3 for the
desktop, and says what of Inputs 1 and 2 is left to TS1.

This is the second version of the plan, revised after a five-lens review;
see [plan-review.md](plan-review.md). R1–R7 there await the Navigator's
ruling; the plan below is written toward each recommendation.

Read from the code, not guessed:

- **Pi 1.4.0 already does the queueing.** `AgentSession.prompt(text, {
  streamingBehavior })` queues the text as a steer or a follow-up while a
  run is active and throws "Agent is already processing…" without the
  option; its `preflightResult(disposition)` hook is called once with
  `started`, `queued` or `handled` when the prompt is accepted, and never
  when it is rejected. Pi's RPC mode answers its `prompt` command from that
  hook and reports a rejection only if the hook never fired
  (`dist/modes/rpc/rpc-mode.js`). The host today refuses while streaming
  (`session_busy`), fires `prompt()` without waiting, and turns a later
  rejection into a `session.extension_error` event named `host/prompt`,
  which the transcript shows as "Extension failed".
- **`prompt()` runs an extension command first, even while streaming**,
  and answers `handled`; "Extension commands manage their own LLM
  interaction via pi.sendMessage()", so a run may follow a `handled`.
  `handled` is also what an `input` handler that consumes the text yields.
  The refusal "cannot be queued" exists only on `steer()`/`followUp()`,
  which this plan does not use. Mirror registers no command; the person's
  own extensions may.
- **`isStreaming` is false while `prompt()` awaits its input handlers and
  the auth check**, before `_startRun` sets `_isAgentRunActive`; and the
  server answers requests concurrently (`void handle(...)`). Two prompts
  in flight can both pass the check; the loser's `agent.prompt` throws
  after its preflight fired, and its catch resets `_isAgentRunActive`
  under the winner's run.
- **A `prompt()` called while `agent_settled` is being emitted is
  deferred** to after the settle's handlers and resolves at once with no
  disposition; the preflight fires when the deferred call runs. Mirror's
  settle handler awaits a spawn there, so a steer sent as a turn settles
  meets this window.
- **The queue's events are already in the protocol.** `queue_update {
  steering, followUp }` is projected by `sessions.ts` and ignored by the
  UI. Pi emits it when a message is queued (before the preflight answers
  `queued`), when a message leaves the queue (before its `message_start`,
  so a UI sees the queue shrink first), and on `clearQueue()`.
- **Abort leaves the queue behind.** `abort()` sets the abort flag, aborts
  the agent and waits for idle; the session's `_steeringMessages` and the
  agent's queues stay as they are, and `_handlePostAgentRun` returns false
  under abort, so nothing drains. The next run polls the steering queue at
  its start (`agent-loop.js`, "user may have typed while waiting"), so a
  message queued before a stop would be delivered inside the next turn,
  unseen. Terminal Pi's Escape calls `clearQueue()` into the editor, queued
  text first, then aborts (`restoreQueuedMessagesToEditor`). `clearQueue()`
  empties both the session's lists and the agent's queues
  (`clearAllQueues`) and emits an empty `queue_update`. `abort()` resolves
  after `agent_settled` has been emitted to listeners
  (`_emitAgentSettled`, then `_resolveIdleWaitIfIdle`).
- **A message can be withdrawn and delivered at once.** The loop's
  `getSteeringMessages` drains the agent's queue at the end of an inner
  iteration (`agent.js`, `createLoopConfig`), while the session's list is
  spliced only when the message's `message_start` runs; between them sits
  `prepareNextTurn`, long under compaction. A `clearQueue()` in that window
  returns a text the loop still delivers.
- **A failed run continues with the queue.** After a run ends on an error
  the retry policy gives up on, `_handlePostAgentRun` returns
  `hasQueuedMessages()`, and the session calls `agent.continue()`, which
  drains the steering queue, else the follow-up queue, into a new loop.
  Terminal Pi does the same. Pi Durable's `afterFailedRun: keep` is not
  what Pi does; it is decided inside the run, where the host has no say.
- **Every delivered message is echoed, in Pi's expanded form.** The loop
  emits `message_start` and `message_end` for the prompt and for every
  queued message it takes, with role `user`; `_queueSteer` pushes
  `expandedText` (skill and template expansion, an `input` handler's
  rewrite), so `queue_update`, the echo's text and `clearQueue()`'s return
  all carry that form, as terminal Pi's "Steering: …" line does. A message
  a `before_agent_start` handler returns is role `custom` (`_prepareRun`),
  so Mirror's context block is never a user message. An extension may
  inject a user-role message through `sendUserMessage`, which goes through
  `prompt()` and the same queue. The host already forwards every
  `message_end` with its role and text; every fixture's first two events
  are the prompt's echo; `reduceRows` ignores a user `message_end`, since
  the store places the person's row at send and takes it back on refusal
  (US3).
- **`agent_start` fires more than once per turn.** Each `continue()` emits
  `agent_start` again; `agent_settled` fires once, at the end of
  `_startRun`, with `aborted`. `before_agent_start` fires once per
  `_startRun`, in `_prepareRun`, not per `continue()`. The UI's `running`
  keys on `agent_settled` to clear and on nothing to set but its own send.
- **A stop ends the message with `stopReason: "aborted"`** and
  `errorMessage: "Request was aborted"`, persisted to the session file like
  any `message_end`; an abort during `before_agent_start` is honored at
  `agent_start` (`_handleAgentEvent`), so a stop before the first delta
  yields an empty aborted message, never a full stream. A tool running at
  the abort ends with an error result "Operation aborted"
  (`executeToolCalls`), and the loop then streams on the aborted signal
  into one more, empty, aborted assistant message. Pi's TUI prints
  "Operation aborted" in the error color under the partial text.
  `reduceRows` keeps the `stopReason` on the row and suppresses the error
  notice for an aborted message, leaving the mark to this story; the
  host's transcript reader keeps an empty aborted entry (it carries
  `errorMessage`), `rowsOf` drops it.
- **Pi's refusal messages carry paths.** `formatNoApiKeyFoundMessage` and
  `formatNoModelSelectedMessage` (`auth-guidance.js`) embed
  `join(getDocsPath(), "providers.md")`, an absolute path under the
  person's home or inside the app bundle. `HostError`'s rule, "never raw
  exceptions, paths or secrets", holds; the host's `failureOf` maps the
  unnamed to `internal_failure` with the words on stderr.
- **Mirror sees a queued message as part of the run.** Its logger's `input`
  hook ignores an input with `streamingBehavior` ("it joins a run already
  going and starts none"), and `agent_settled` sends the run's whole reply,
  every assistant text of every `agent_end`, to `stop`. So a steered turn
  is one Mirror turn: the prompt as typed and the reply as Pi gave it, the
  steer itself not logged, exactly as in terminal Pi. A stopped run
  settles with `aborted: true` and logs its partial reply; nothing closes
  the conversation. No Core-owned prerequisite; a Mirror candidate is
  named (R7).
- **The fake host answers `session.abort` and plays nothing**; its header
  leaves what Stop does to this story. Its prompt check requires a user
  `message_end` in a scripted turn to say the turn's prompt; a mid-turn
  user message would be refused as "its user message says…".
- **The composer is where the keys live.** Enter sends, Shift+Enter breaks
  a line, Escape stops through `useEscapeToStop` with the overlay rule;
  while running, Stop replaces Send and the status line says the draft
  stays. `send()` in the store returns early while `running`, and its
  `takeBack` drops the in-flight text when the draft is no longer empty.

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | How a message joins a running turn | **Through `session.prompt`, as Pi's own `prompt()` takes it:** the request gains `streamingBehavior?: "steer" \| "followUp"`, Pi's name kept so nothing is translated. The host passes it to `prompt()`; Pi queues while a run is active and starts a run when none is, so a steer that lands a moment after the turn settled is simply sent, which is what the person meant. Without the option while streaming, the host still refuses with `session_busy`, before calling Pi. **The host serializes prompt acceptance per session**: a second `session.prompt` reaches Pi only after the first's preflight fired or its call resolved, so two prompts never both pass Pi's streaming check; the composer stays live during the wait. *Alternative:* two requests, `session.steer` and `session.followUp`, as the RPC mode's commands; and on an idle session `steer()` queues without starting a run, the "unseen" fate. |
| D2 | What `session.prompt` answers | **A disposition, through Pi's preflight, or a named refusal in the host's words.** The host wraps `prompt()` as the RPC mode does and answers `{ sessionId, disposition }` when `preflightResult` fires: `started`, `queued`, `handled`, or **`deferred`** when `prompt()` resolved before its preflight, which means Pi deferred the call to after the settling turn; the screen treats `deferred` as `queued`. Before calling Pi, the host checks what it can and refuses in its own words with `prompt_refused`: no model on the session ("No model is selected for this session."), no credential for the model's provider ("No credential for <provider>: sign in first."), compaction in progress ("Pi is compacting the session; try again in a moment."); a run in progress without a behavior is `session_busy`. A rejection Pi raises before preflight for any other reason is `internal_failure` with the words on stderr, as today, since Pi's messages carry paths (R1). A rejection after preflight (the run itself failing, a deferred call that throws) stays an event, as today. The host never awaits the run. `HostError` gains `prompt_refused`. *Alternative:* keep fire-and-forget and add the option only: a queued message Pi refuses would be reported as an extension failure and the text lost. |
| D3 | What Stop does to the queue | **Withdraws it, then aborts, then withdraws again, and returns what no one got** (Planning Input 3): `stopTurn` calls `clearQueue()`, `abort()`, and `clearQueue()` once more, since a steer whose input handlers were still running when the first clear happened queues after it and would ride the next turn unseen; it watches the session's events in between and removes from the union every user `message_end` text it saw, first occurrence each, since a message the loop had already drained is delivered, not withdrawn. `session.abort` answers `{ sessionId, withdrawn: { steering, followUp } }`, Pi's expanded text. The UI puts the withdrawn messages back in the draft by the one merge rule (D11). Pi emits the empty `queue_update` on each clear and `agent_settled { aborted: true }` on the abort, both before the answer; the answer also settles the conversation (`running: false`), since `abort()` returns only once Pi is idle, and the store is idempotent whichever arrives first. A stop with nothing queued answers empty lists; a stop on an idle session answers at once. A `session.abort` that fails is said once as a toast, the queue left as the events say. *Alternative:* one clear, as terminal Pi: it has no concurrent client to race. |
| D4 | What a failed run does to the queue | **What Pi does: it continues with the queue**, steering first, and the screen shows it: the error notice, then the delivered message as the person's row, then its answer. Adopted, not chosen: the continuation is decided inside Pi's run, where the host has no hook, and terminal Pi behaves the same. Said here so the DS2 inputs have their answer. |
| D5 | Where a delivered message appears | **From Pi's echo, where Pi said it.** `reduceRows` learns the user `message_end`: a user row with its text; a `message_end` of any other role but `assistant` (`custom`, `toolResult`, `bashExecution`) stays ignored. The store keeps US3's row at send for a prompt (it shows at once; a refusal takes it back) and marks the conversation `awaitingEcho`, set before the request leaves; the first user `message_end` after the store's own prompt is that echo and is swallowed, every other user `message_end` is a delivered message and becomes a row, whatever `running` says. `awaitingEcho` is cleared wherever the echo cannot come: every `send()` failure, `handled`, `agent_settled`, the connection's loss. A queued message places no row at send: its row is Pi's echo, whether Pi queued it, deferred it, or started a run with it (D1's race), so the transcript shows the message once, at the point Pi took it. It could not be placed early: the open assistant row is still streaming, and a user row after it would split the answer in two. The prompt's optimistic row keeps the typed form (a `/skill` shows as typed); a delivered row carries Pi's expanded text, as the file will. A user-role message an extension injects is drawn as the person's, as the read transcript and Pi's TUI draw it (R4). *Alternative:* drop the optimistic row and draw every user row from the echo: one path, but the message would appear only when Pi starts the run, after `before_agent_start`, and US3's tests and words say it shows at once. |
| D6 | The queue on screen | **Above the text box, in the composer's measure.** A list labelled "Queued messages", one line per message, muted, in the terminal's form: "Steering: " or "Follow-up: " then the text as a text node, cut to the line with an ellipsis; after Pi's lines, each message the store has sent and Pi has not yet named, as "Sending: " with its kind, so a message is never nowhere; after the list, while it is non-empty, one muted line: "Stop puts them back in the draft." The order is Pi's: steering messages, then follow-ups. It is unmounted while nothing is queued or sending. The conversation holds `queue: { steering, followUp }` as **the last `queue_update` said and nothing else**: never emptied at `agent_settled`, so a message Pi still holds stays on screen rather than riding the next turn unseen; and `sending: { text, behavior }[]` for the in-flight requests. *Alternative:* queued messages drawn into the transcript as pending rows: they would sit after the streaming answer and break it (D5). |
| D7 | The composer while a turn runs | **Enter steers, Option+Enter follows up, Escape stops; Steer, Follow up and Stop as buttons.** Send is replaced by Steer (accent, the send glyph, `title` "Steer (Enter)", `aria-keyshortcuts="Enter"`) and Follow up (plain, a corner-down-right glyph, "Follow up (Option+Enter)", `aria-keyshortcuts="Alt+Enter"`), both disabled on an empty draft, then a gap, then Stop with its square. The status line under the text box reads "Pi is answering. Enter sends before its next step, Option+Enter after it finishes, Escape stops it." (R3). US3's line, which said the draft stays, is replaced: Enter is no longer dead while running, which is the point. Enter on an empty draft does nothing; the sessions list keeps its own Enter and Escape (US1 D5). Focus returns to the text box whenever the draft is restored (a stop, a refusal, `handled`). Pi's keys are Enter for a steer and Alt+Enter for a follow-up; Option is Alt on the one platform the bundle ships for. *Alternative:* keys only, as terminal Pi: a mouse would have no way to queue. |
| D8 | `running`, and the composer while a session opens | **`agent_start` sets `running: true`, idempotently; `agent_settled` clears it; `send()` still sets it before its request.** So a run a `handled` command starts, a run a `continue()` begins after a failed run, and a steer answered `started` or `deferred` after the turn settled all show as running, with Stop, without the store guessing from an answer. `handled` never settles: the draft stays cleared, the prompt's optimistic row is removed (nothing reached the model), and a toast says "Pi ran that as a command; nothing was sent to the model." (R2). While opening, unchanged: Send disabled, Enter refused with the draft kept (US3). |
| D9 | The stopped answer | **Marked by its `stopReason`, live and read alike.** An assistant row that is done with `stopReason: "aborted"` draws one muted meta line under its text: "Stopped" (R5). An aborted `message_end` with no open row appends an empty, done, aborted assistant row, so the stop is visible when it landed before the first delta and, after a tool call, where the answer would have continued, after the tool's error result; `rowsOf` keeps a read entry with no text and `stopReason: "aborted"` the same way, so a session read from its file shows its stops where `pi -r` shows "Operation aborted". The error notice stays suppressed for an aborted message: a stop is the person's own act. |
| D10 | The connection lost with messages queued or sending | **They go back to the draft.** `connectionLost()` already settles an answering conversation with its notice; it now also withdraws the conversation's queue view and its sending list into the draft, deduplicated by text, by the one merge rule (D11), and empties both: the queue was in the host's memory and died with it. A `queueMessage` request the loss rejects restores nothing itself, so no message returns twice. The reconnection, and what a reconnected UI reads of a turn in flight, stay TS1's (Planning Input 2); US2 keeps the host free of queue state of its own, so that view can be rebuilt from Pi (`getSteeringMessages`, `getFollowUpMessages`) when TS1 needs it. |
| D11 | One rule for every return to the draft | **Terminal Pi's merge, never discarding.** The texts returned (withdrawn steering, then follow-ups, or the one refused), then what the draft holds, each dropped when blank, joined by blank lines (`[queued, current].filter(t => t.trim()).join("\n\n")`). Used by the stop's answer, a refusal, `handled`, and the connection's loss. US3's `takeBack`, which kept the typed text and dropped the in-flight one, is replaced by it for the prompt's refusal too. |
| D12 | A send that carries an id (Planning Input 1) | **Ruled out here, left whole to TS1.** Nothing reconnects yet, so an id would have no reader. US2 adds no new exposure: a queued message's request that the connection's loss rejects is returned by `connectionLost()` (D10), and the queue itself dies with the host, so nothing queued survives a loss to be sent twice. The window that remains, a prompt accepted and unanswered when the host died, is US3's and TS1's to close, with the id made where TS1 decides. |
| D13 | The fake host | **Keeps Pi's queue rules and plays Stop.** A `session.prompt` with `streamingBehavior` while the session's held turn is still playing is queued: `queue_update` with the queue broadcast first, then the answer `queued`, as Pi orders them; its text runs through the content net as a violation; one while nothing plays is the next scripted turn (answer `started`); a scripted turn may answer `handled` instead. A scripted user message mid-turn is delivered from the queue by first occurrence, the `queue_update` sent before it as Pi does, and one whose text was never queued is a violation; a queue not empty at a scripted `agent_settled` that is not aborted is a violation, since Pi drains before it settles. A fixture never carries `queue_update`: the loader refuses one, since it is the host's event, not the turn's; the world's check requires the first user message to be the prompt and lets later ones be deliveries. The fake host never expands text and does not claim to prove expansion. `session.abort` on a held turn still playing plays what Pi does: the empty `queue_update`; an open tool ended with `isError` and "Operation aborted"; an open assistant message ended with the text streamed so far, `stopReason: "aborted"` and `errorMessage: "Request was aborted"`, else an empty one started and ended so; `agent_end`; `agent_settled { aborted: true }`; then the answer with the queue withdrawn; the events left dropped and not counted as "never played"; the disk records what played, not what was scripted. On a turn not playing: an empty answer and nothing played. `failures` learns `session.prompt`. |
| D14 | The protocol | **Three changes, one code, one bump.** `streamingBehavior?` on `session.prompt`; `disposition` (`started \| queued \| handled \| deferred`) on its result; `withdrawn` on the abort's result; `prompt_refused`; `PROTOCOL_VERSION` 0.5.0 → 0.6.0, since a result's shape changes and an old host would strip the option and refuse every steer as busy. |

## Scope

1. **The protocol** (D14): the field, the two result shapes, the code, the
   bump; schema tests in `packages/protocol/src/index.test.ts` for a prompt
   with each behavior and with none, a result with each of the four
   dispositions and with none (refused), an abort result with and without
   the withdrawn lists (refused), and the new error code.

2. **The host's turn control** (D1, D2, D3): `packages/host/src/turnControl.ts`,
   pure over a stub of the session's surface (`isStreaming`,
   `isCompacting`, `model`, `prompt`, `clearQueue`, `abort`, `subscribe`):
   `acceptPrompt(session, text, behavior, { hasCredential, onLateFailure })`
   refuses in the host's words (`PromptRefusedError`) or with
   `SessionBusyError` before calling Pi, resolves with the disposition from
   preflight, `deferred` when `prompt()` resolves first, rejects with a
   pre-preflight rejection (mapped to `internal_failure`), and hands a
   post-preflight rejection to `onLateFailure`; `stopTurn(session)` clears,
   aborts, clears again, subtracts the user messages delivered meanwhile,
   and returns the withdrawn lists. Tests in `turnControl.test.ts`: the
   four dispositions; each host-word refusal and busy; a rejection before
   preflight; a rejection after it reaching `onLateFailure`; a steer that
   queues after the first clear and is still withdrawn; a text drained
   and delivered between the clear and idle not in `withdrawn`; the
   withdrawn lists empty on an idle session. `SessionRegistry.prompt`
   serializes acceptance per session and wires `onLateFailure` to the
   extension-failure event; `abort` uses `stopTurn`; `server.ts` passes
   the behavior and the answers through and maps `PromptRefusedError`.

3. **The fake host** (D13): the queue, the dispositions, the delivery
   check, the stop played, `failures` for `session.prompt`, the content net
   over queued text, the loader refusing `queue_update` in a fixture, the
   disk recording what played; tests in `fakeHost.test.ts` and
   `turns.test.ts`, including two identical steers dequeued in order. A new
   fixture `steered-answer.json`: a prompt, a first assistant turn with a
   tool call, a user message mid-turn, a second assistant turn, settled;
   invented and inert.

4. **The transcript's data** (D5, D9): `reduceRows` folds a user
   `message_end` into a user row, ignores `custom` and `toolResult`, and
   folds an aborted `message_end` with no open row into an empty stopped
   row; `rowsOf` keeps an empty aborted entry. Tests in
   `conversations/transcript.test.ts`.

5. **The store** (D1–D6, D8, D10, D11): `queue`, `sending` and
   `awaitingEcho` on `Conversation`; the merge rule `returnToDraft`;
   `queueMessage(client, journeyId, behavior)` for a running conversation
   (no row, the draft cleared, the text in `sending` until the answer or
   Pi's `queue_update`, restored by the rule with the reason thrown on
   refusal, nothing restored on `connection_lost`); `send()` marking the
   echo before its request and handling `handled`; `applyHostEvent`
   swallowing the echo, folding deliveries, keeping the queue from
   `queue_update` only, setting `running` on `agent_start`, clearing it and
   `awaitingEcho` at `agent_settled`; `abort()` returning the withdrawn
   messages to the draft, settling, and saying a failure; `connectionLost()`
   withdrawing the queue and the sending list. Tests in `store.test.ts`
   against the stub connection, with the answer and the events staged in
   both orders where both can happen: each case in the index's acceptance
   behavior; the echo swallowed once and only for the store's own prompt;
   the echo arriving before the prompt's answer; a steer answered
   `started` or `deferred` drawn once from its echo and running from
   `agent_start`; a delivered echo whose text differs from what was typed;
   the draft's order after a stop with typed text present and with an
   empty draft; the abort's answer before and after `agent_settled`, the
   draft filled once; a refused steer back in the draft without
   discarding what was typed; `handled` leaving the run to the events;
   a queue that survives a settle staying on screen; the loss with one
   steer in flight and one queued restoring each once.

6. **The composer and the transcript** (D6, D7, D9): `Composer.tsx` with
   the two buttons, the glyphs, the shortcuts, the keys, the new line and
   the focus return; `QueuedMessages.tsx` above the text box with the
   sending lines and the Stop line; `TranscriptRow.tsx` drawing "Stopped".
   UI tests in `Composer.test.tsx`, `Conversation.test.tsx` and
   `Transcript.test.tsx` against the fake host: Enter on a held turn queues
   a steer, the queue shows "Steering: …"; Option+Enter queues a follow-up
   after it; the buttons do the same; the user row appears when the
   delivery is released, after the tool row and before the second answer,
   and the queue line goes; Escape with two messages queued and "c" typed
   stops the turn, the partial answer stays with "Stopped" under it, the
   draft reads the two messages and "c" in order, Send is back and the
   text box has focus; a stop before any delta shows the empty stopped
   row; a stop released through `tool_start` shows the tool's error and
   the empty stopped row after it; Enter on an empty draft while running
   sends nothing; a refused steer shows the toast and the draft; the
   `handled` toast; the Stop line present only with a queue; US3's test
   that Enter keeps the draft while running is rewritten to what Enter
   now does. The `styles/tokens.test.ts` net holds the new classes.

7. **Docs.** AGENTS.md's fake-host bullet (Stop played, the queue, the
   fixture rule); the headers of `sessions.ts`, `fakeHost.ts`,
   `conversations/store.ts` and `Composer.tsx`; at Done, a decision in
   `decisions.md` on what a running turn does with a message and what
   Stop does with the queue (D1, D3, D4, D5; R6); the DS2 index's
   "Answered so far" for Inputs 1–3 (D4, D10, D12) and the Mirror
   candidate for logging queued messages (R7); this story's index and the
   CV1.DS2 candidate table at Done; the worklog.

## Non-Goals

- Withdrawing the queue, or one message of it, without stopping: Pi's
  dequeue key. Later, when daily use asks; Stop is the way back for now,
  and the screen says so.
- Refusing a `/`-prefixed message while running: Pi executes an extension
  command at once and answers `handled`, which the screen tells (D8);
  parsing commands in the host would drift from Pi.
- Queueing during compaction: Pi refuses a prompt while it compacts, and
  the host says so in its own words with the draft kept (D2); the
  terminal's own compaction queue is not rebuilt here.
- Keeping the typed form of a queued message beside Pi's expanded one:
  queue state of the host's own, against D10, and a match the UI cannot
  make from `queue_update`; Pi's form is shown, as in the terminal.
- Images or attachments on any message: none exist in the app yet.
- A send that carries an id, and what a reconnected UI reads first of a
  turn in flight: CV1.DS2.TS1 (D10, D12).
- Choosing the model or thinking level: CV1.DS2.US3.
- A turn silent beyond a bound, a `session.abort` that never answers
  because a tool hangs, and a lost host's effect beyond the draft:
  CV1.DS2.TS1.
- Logging a steer in Mirror as a prompt of its own: Mirror's rule (CR160),
  the same in terminal Pi; recorded as a fact and named as a candidate
  (R7), not changed here.
- The order of unsubscribe and abort in the host's `close()` (TD-004's
  note): TS1's lifecycle.
- Any change to the Mirror core, the Rust shell, sign-in, or how a session
  is opened, listed or read (US1).

## Acceptance Behavior

```text
Given a turn running in the Journey on screen
When the person types "Keep it short" and presses Enter, or clicks Steer
Then the host receives session.prompt with streamingBehavior "steer", the draft is empty, the queue above the composer lists "Sending: Keep it short" then "Steering: Keep it short" once Pi has it, and a line says Stop puts it back in the draft
And when Pi takes it, the queue line goes, and "Keep it short" appears in the transcript as the person's message after the answer's turn so far and before what follows

Given a turn running in the Journey on screen
When the person types "Then list the files" and presses Option+Enter, or clicks Follow up
Then the host receives session.prompt with streamingBehavior "followUp", and the queue lists "Follow-up: Then list the files" after any steering message
And it is delivered when the answer would have ended, as the person's message, with its own answer after it

Given a turn running with "a" steering and "b" following up, and "c" typed in the draft
When the person presses Escape or clicks Stop
Then the host clears Pi's queue before and after it aborts and answers with both messages withdrawn, the partial answer stays in the transcript with "Stopped" under it, the queue is empty, Send is back, the text box has focus, and the draft reads "a", a blank line, "b", a blank line, "c"
And with nothing typed the draft reads "a", a blank line, "b"
And the session is still open, mirror conversations shows the same conversation still open, and the next send continues them

Given a steer whose input handlers were still running when Stop landed
When the host's second clear finds it
Then it is withdrawn into the draft like the others, and nothing rides the next turn

Given a steer the loop had already drained when Stop landed
When its echo arrives before the turn settles
Then it is in the transcript as the person's message and not in the draft

Given a turn stopped before any of its answer streamed, or during a tool call
When the stop settles
Then the transcript shows an empty answer marked "Stopped", after the tool's error result when there was one

Given a steer sent as the turn settles
When the host answers disposition "started" or "deferred"
Then the message is drawn once, from Pi's echo, as the first message of the new run, and the conversation is running from Pi's agent_start

Given a prompt the host refuses before Pi starts it (no model, no credential, compaction)
When the host answers prompt_refused in its own words
Then the message is back in the draft before whatever was typed meanwhile, the reason shows once as a toast, no row remains, and the text box has focus

Given a message Pi handles as an extension command
When the host answers disposition "handled"
Then no row remains, the draft stays cleared, a toast says Pi ran it as a command, and the conversation is running only if Pi's agent_start says so

Given a run that fails on an error with a follow-up queued
When Pi continues with it
Then the transcript shows the provider's error, the follow-up as the person's message, and its answer; the queue is empty at the end

Given a queue Pi still holds when a run settles
When agent_settled arrives
Then the queue stays on screen as Pi's last queue_update said

Given messages queued and one still sending when the connection to the host is lost
When the conversation settles
Then each is back in the draft once, in order, and the connection-lost notice follows the partial answer

Given a turn running
When the person presses Enter on an empty draft, or Enter and Escape with the sessions list open
Then nothing is sent and nothing stops, and the list closes on Escape

Given a session read from its file with a stopped answer in it
When it is shown
Then that answer is marked "Stopped" where it was, and an empty stopped answer is shown too
```

## Validation Route

Automated, from the repository root: the gate (`npm run typecheck`,
`npm test`, `npm run build`, `git diff --check`) and the story's tests as
[test-guide.md](test-guide.md) lists them. The host changes how it drives
Pi (a prompt through preflight, a stop that clears the queue), so the gate
includes one real turn through the host on a Journey the Navigator names
(`npm run turn --workspace packages/host -- --journey <slug> --prompt "…"`).
`cargo check` is not in the gate: the shell does not change.

Navigator, in the window (`npm run dev`), on a Journey the Navigator names
(the automation Journey served US1 and US3), with a terminal open in that
Journey's project path:

| Step | Do | Expected observation |
|---|---|---|
| 1 | Send a prompt that takes several tool calls ("List the top-level folders of this project one at a time, with a sentence on each, using one tool call per folder"); in the terminal, `mirror conversations` | The answer streams with tool rows; Send is replaced by Steer and Follow up, then Stop; the line says Enter sends before its next step, Option+Enter after it finishes, Escape stops it; `mirror conversations` shows the conversation open: this is the baseline |
| 2 | While it runs, type "One word per folder from here on" and press Enter | The draft empties; "Sending: …" for a moment, then "Steering: One word per folder from here on" above the text box with "Stop puts them back in the draft." under it; when the current assistant turn ends, the lines go and the message appears in the transcript as yours, after the tool rows so far; the answer changes course after it |
| 3 | While it still runs, type "Then say done." and press Option+Enter | "Follow-up: Then say done." above the text box; the message is delivered after the answer would have ended, appears as yours, and "done" follows it; the queue area is gone; Send is back |
| 4 | In the terminal, `pi -r` and pick the session; then `mirror conversations` | Both messages are in the transcript where the desktop showed them; the steered turn is one Mirror turn: the same conversation, one more exchange, not three; quit without sending |
| 5 | Send a prompt for a long answer ("Write 600 words on tides"); when a paragraph has streamed, press Escape | The text stops where it was with "Stopped" under it; the queue area is absent; Send is back; the text box has focus; `mirror conversations` shows the same conversation still open, none ended, none new |
| 6 | Send "Continue from where you stopped, in one sentence." | The answer follows in the same session; `mirror conversations` still shows the same conversation |
| 7 | Send another long prompt; while it streams type "a" Enter, "b" Option+Enter, then type "c" without sending; press Escape | The queue shows "Steering: a" then "Follow-up: b"; after Escape the draft reads "a", a blank line, "b", a blank line, "c", the queue area is gone, and the partial answer is marked "Stopped"; neither "a" nor "b" was sent (`pi -r` shows no user message with either), and the next send's answer does not act on them |
| 8 | Send a long prompt and press Escape before the first word streams | The transcript shows your message and an empty answer marked "Stopped"; Send is back |
| 9 | Send a prompt that runs a slow tool ("Run `sleep 20` and then tell me the time"); press Escape while the tool row is open | The tool row ends with an error, an empty answer marked "Stopped" follows it, Send is back |
| 10 | Quit the app, relaunch, pick the Journey | The session read from its file shows the stopped answers marked "Stopped" where they were, and the steered messages in place |

**Pass:** every observation holds. **Fail:** any does not; or a queued
message is delivered into a later turn after a stop; or a stop ends or
replaces the Mirror conversation; or a steered turn shows as more than one
Mirror turn; or a steer or follow-up shows twice, or not at all, in the
transcript; or Enter while running leaves the draft in place; or
Option+Enter inserts a line instead of queueing.

Consciously left out of the window, proven against the fake host and the
stub only: a run that fails with a follow-up queued (D4), which cannot be
provoked on demand against a real provider; the connection lost with
messages queued (D10); a refusal in the host's words and a `handled`
command, since no model, no credential and compaction cannot be staged on
a signed-in session and Mirror registers no command; and the stop's two
race windows (D3), which the stub stages and a hand cannot.

E2E decision: required. The fake host proves every path in the UI, the
stub proves the host's turn control, but only the window with Pi proves
that Pi delivers a steer between its turns and a follow-up at the end,
that the cleared queue stays clear for the next turn, that Option+Enter
reaches the webview as Alt+Enter on macOS, and that Mirror's logger
settles a stopped run without closing the conversation and logs a steered
run as one turn.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS2.US2`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- No new dependency. No change to the Mirror core or `apps/desktop/src-tauri`.
- The protocol first, then the host, then the UI, as AGENTS.md orders a
  new capability. Slices, each committed green: (1) the protocol; (2) the
  host's turn control and its wiring; (3) the fake host and the fixture;
  (4) the transcript's data and the store; (5) the composer, the queue
  and the stopped mark, with the UI tests; (6) the docs and comments. As
  US1 found, (1) may not commit green alone, since the result shapes
  change under the server's exhaustive switch and the fake host; then (1)
  to (3) land together.
- A real turn runs only on the Journey the Navigator names, at validation.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- `preflightResult` fires late or not at all on an accepted prompt in a
  real turn beyond the deferral D2 names (the answer to `session.prompt`
  waits on `before_agent_start`, where Mirror's hook awaits its context
  delivery): if the answer takes longer than the first event, D2 is
  revisited toward an accepted-at-once answer with the disposition as an
  event
- the second `clearQueue()` after `abort()` still leaves a message for
  the next run in a real turn (checked at validation step 7)
- Option+Enter does not reach the webview as `altKey` on macOS (checked
  at validation step 3); the follow-up key is then chosen with the
  Navigator and said here, the button standing meanwhile
- Mirror's logger closes, replaces or fails the conversation on a stopped
  run, or logs a steered run as more than one turn (checked at validation
  steps 4 to 6); then a Core-owned prerequisite, not a local fork
- the fixture loader's shape rule (TD-001's `checkShape`) cannot admit a
  user message mid-turn without weakening what it proves for every other
  fixture
- serializing prompt acceptance per session delays a steer visibly behind
  a prompt whose `before_agent_start` is slow (the sending line covers
  it; if it reads as a hang, the Navigator decides whether the composer
  waits instead)

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval; R1–R7 in
  [plan-review.md](plan-review.md) await ruling.
