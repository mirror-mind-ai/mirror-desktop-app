[< Story](index.md)

# Plan Review — CV1.DS2.US2

**Date:** 2026-11-04
**Reviewed:** the first version of the plan, the story and the test guide, as authored at the Plan checkpoint (uncommitted).
**Outcome:** the plan was revised with the twenty-two defects below; R1–R7 await the Navigator; the current version is [plan.md](plan.md).

## How it was reviewed

Five lenses were chosen for what this plan puts at risk:

- **engineer**, for the host's new seam (a prompt answered through Pi's
  preflight, a stop that clears the queue, `turnControl.ts` over a stub),
  the protocol's shape, the store's state model (the echo swallowed once,
  the queue, a steer answered `started`, `handled`), and the fake host's
  faithfulness;
- **quality-assurance**, for whether each scenario is provable the way the
  plan says, the races a concurrent host and an asynchronous Pi open, what
  the fake host must play, and whether the route can be judged alone;
- **experience-designer**, for the composer with three buttons, the queue
  above the text box, the "Stopped" mark, the draft after a stop, and the
  words beside US1's and US3's;
- **ai-engineer**, for the agent loop's actual semantics (where a steer and
  a follow-up are delivered, what one run is, what `abort()` and
  `clearQueue()` do, the queue after a failed run, what `preflightResult`
  promises) and what Mirror's logger makes of a steered or stopped run;
- **security-engineer**, narrowly, for what newly crosses the socket and
  the webview boundary: `prompt_refused` carrying Pi's words against the
  `HostError` rule, withdrawn text returning to the draft, queued text on
  screen, text an extension or a skill expansion puts in the person's row.

Database-architect and devops-engineer were left out: no schema is touched
and nothing in the runtime's operation changes.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror as the system prompt, no tools, no session, no extensions, no
skills, no context files, nothing logged to Mirror). Each saw the plan,
the story, the test guide, the Delivery Story with its Planning Inputs,
the repository rules, the development guide's lifecycle and verification
sections, D14 and D16, the debt ledger, US3's story, the code the story
touches (protocol, host sessions, server and policy, conversations store
and transcript, Composer, the Escape hook, Conversation, TranscriptRow,
host client), the test harness (fake host, turns, worlds, the composer
tests, the tool-use fixture), and the relevant source of Pi 1.4.0's
`AgentSession`, the agent core's loop and queues, Pi's RPC and interactive
modes, the TUI's aborted message, and Mirror 0.38.0's logger extension.

The Driver then verified the sharpest claims:

- **Mirror's context message has role `custom`, not `user`.**
  `_prepareRun` (`agent-session.js`) pushes every message a
  `before_agent_start` handler returns with `role: "custom"`. Three
  reviewers feared D5 would draw the context block as the person's row on
  every turn; it will not. A `message_end` of any role but `user` and
  `assistant` is ignored, and the transcript tests now say so.
- **`before_agent_start` fires once per `_startRun`**, in `_prepareRun`,
  not per `continue()`. A steered or followed-up run is one Mirror turn,
  as the plan said; the route now checks it.
- **`prompt()` executes an extension command first, even while streaming,
  and answers `handled`**; `_throwIfExtensionCommand` ("cannot be queued")
  is reached only from `steer()`/`followUp()`, which D1 does not use. The
  plan's refusal case and acceptance line were wrong.
- **`getSteeringMessages` drains the agent's queue** (`agent.js`,
  `createLoopConfig`), while the session's `_steeringMessages` list is
  spliced only when the message's `message_start` runs. A `clearQueue()`
  in between returns a text the loop is about to deliver: both withdrawn
  and delivered. The window is `prepareNextTurn`, long under compaction.
- **`isStreaming` is false while `prompt()` awaits its input handlers and
  the auth check**, before `_startRun` sets `_isAgentRunActive`; the
  server answers requests concurrently (`void handle(...)`). Two prompts
  in flight can both pass the check, and the loser's `agent.prompt`
  throws after its preflight fired and resets `_isAgentRunActive` under
  the winner's run. The host must serialize prompts per session.
- **`prompt()` called while `agent_settled` is being emitted is deferred**
  and resolves at once with no disposition; the preflight fires when the
  deferred call runs. Mirror's settle handler awaits a spawn there, so a
  steer sent as a turn settles will meet this window.
- **`formatNoApiKeyFoundMessage` embeds absolute paths**
  (`auth-guidance.js`: `join(getDocsPath(), "providers.md")`), under the
  person's home or inside the app bundle. The plan's claim that Pi's
  refusal names only a documented file was wrong; `HostError`'s rule
  stands.
- **An abort during `before_agent_start` is honored at `agent_start`**
  (`_handleAgentEvent`: `if (event.type === "agent_start" &&
  this._agentRunAbortRequested) this.agent.abort()`), so a stop before the
  first delta yields an empty aborted message, never a full stream; route
  step 8 holds.
- **A stop during a tool call** ends the tool with an error result
  "Operation aborted" (`executeToolCalls`), then, with
  `hasMoreToolCalls` true, streams on the aborted signal into an empty
  assistant message with `stopReason: "aborted"`. So the stop mark lands
  where the answer would have continued, after the tool's error, and the
  fake host plays that sequence.
- **The host's transcript reader already keeps an empty aborted entry**
  (`transcript.ts`: `if (text || thinking || message.errorMessage)`, and
  an aborted message carries "Request was aborted"); only `rowsOf` needs
  the change.
- **Mirror registers no extension command** (`mirror-logger.ts` has no
  `registerCommand`), so no refusal or `handled` can be provoked in the
  window on this machine; those paths are proven against the stub and the
  fake host only.

## Navigator rulings

| Decision | Options | Recommendation |
|---|---|---|
| R1 — whose words `prompt_refused` carries (security 2, R1; engineer 10, R1) | (a) Pi's thrown message, as the plan had it, amending `HostError`'s rule; (b) the host's own words for the causes it can check before calling Pi — no model, no credential for the model's provider, compaction in progress — with the provider id, `session_busy` for a run in progress, and `internal_failure` with the words on stderr for everything else, as today; (c) the host's words with Pi's appended for an allowlist of Pi's messages | **(b)**: Pi's credential message carries absolute paths, verified; the host owns the facts (`session.model`, `modelRuntime.hasConfiguredAuth`/`checkAuth`, `isCompacting`) and the protocol's rule stays whole |
| R2 — what a `handled` disposition shows (experience-designer 4, R3; engineer 1, R2; ai-engineer 1, R1) | (a) nothing: the draft cleared, no row, `running` left to the events; (b) that plus a toast once, "Pi ran that as a command; nothing was sent to the model."; (c) a muted row in the transcript | **(b)**: from the person's seat it is a message that went and left no trace, the same shape as a refusal, and a toast is where US3 put such words; (c) leaves a row Pi's file does not have. Either way `running` is never settled by `handled`: a command may start its own run |
| R3 — the status line's words while a turn runs (experience-designer 1, R2) | (a) "Pi is answering. Enter steers it after this turn, Option+Enter follows up when it finishes, Escape stops it."; (b) "Pi is answering. Enter sends before its next step, Option+Enter after it finishes, Escape stops it."; (c) a short line with the keys on the buttons only | **(b)**: the line is the one place the two kinds are told apart, and "turn" is a word the screen has never used; the Navigator's language decides the nouns |
| R4 — a user-role message the person never queued, injected by an extension through `sendUserMessage` (security 5, R2) | (a) drawn as the person's row, as Pi's TUI and the read transcript (US1's `rowsOf`) draw every user-role message; (b) drawn as a runtime notice naming it as not the person's, by matching the echo against what the store queued; (c) dropped | **(a)**: live and read would otherwise disagree on the same session, and (b) needs the store to match Pi's expanded text to typed text, which `queue_update` cannot support; the exposure is an extension under `.pi/`, which already runs code |
| R5 — the weight of the "Stopped" mark (experience-designer R1) | (a) one muted meta line, as the plan has it; (b) the error color, as Pi's TUI prints "Operation aborted"; (c) the notice color | **(a)**: a stop is the person's own act, and the transcript already suppresses the aborted error notice on that ground; red under a stop the person chose reads as a fault |
| R6 — where the decisions are recorded at Done (engineer R3) | (a) a decision in `decisions.md`: what a running turn does with a message and what Stop does with the queue; (b) the DS2 index's "Answered so far" alone | **(a)**: TS1's reconnection view will cite what Stop does to Pi's queue, and it is a behavior terminal Pi and the desktop now share |
| R7 — Mirror's memory of a steer and a follow-up (ai-engineer R2) | (a) record as a fact: a queued message joins the run and is not logged, as in terminal Pi; (b) record it and name a Mirror candidate, not a prerequisite, for logging queued messages with their kind; (c) a Core-owned prerequisite before US2 | **(b)**: US2 makes memory no worse than the terminal, but a conversation whose course changed for a reason Mirror never saw is a memory-quality question the core's owner should see named |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. **An extension command sent while running executes and answers
   `handled`; it is never refused.** Struck from D2's refusals and from
   the acceptance; `queueMessage` handles `handled`; and `handled` never
   settles the conversation (engineer 1, 2; ai-engineer 1; security 3;
   quality-assurance 10).
2. **`agent_start` sets `running: true`, idempotently.** A run a command
   starts, a run a `continue()` begins, and a steer answered `started`
   after the turn settled all show as running without the store guessing
   from the answer (engineer 2, 3; ai-engineer 5; quality-assurance 10).
3. **The stop clears twice and the queue is what `queue_update` says.**
   A steer whose input handlers are still running when Stop lands queues
   after the first `clearQueue()`; `stopTurn` clears again once `abort()`
   resolves and unions both withdrawals. The conversation's queue is the
   last `queue_update` and nothing else: never emptied at `agent_settled`,
   so a residual queue stays on screen instead of riding the next turn
   unseen (engineer 4; ai-engineer 2, 3; security 1; quality-assurance 3,
   R3).
4. **A message both withdrawn and delivered is reconciled in the host.**
   `stopTurn` watches the session's events between the first clear and
   idle and removes from `withdrawn` every user `message_end` text it saw,
   first occurrence each; the draft never gets a message the transcript
   also shows (quality-assurance 2, R2; ai-engineer 10).
5. **The host serializes prompt acceptance per session.** A second
   `session.prompt` reaches Pi only after the first's preflight fired or
   its call resolved, so two prompts can never both pass Pi's streaming
   check; the composer stays live during the wait (quality-assurance 1,
   R1; engineer 11).
6. **A fourth disposition, `deferred`.** A `prompt()` that resolves before
   its preflight fired was deferred by Pi to after the settling turn; the
   host answers `deferred` rather than hang, and the screen treats it as
   it treats `queued`: the echo places the row, `agent_start` sets
   running. A deferred call that then throws surfaces as an extension
   failure event, as a late rejection does; named in the plan
   (ai-engineer 6).
7. **`awaitingEcho` is cleared wherever the echo cannot come**: every
   `send()` failure, `handled`, `agent_settled`, `connectionLost()`; and
   set before the request leaves, as `running` is (engineer 6;
   quality-assurance 9).
8. **Both orders of an answer and Pi's events are tested** against the
   stub connection: the echo and a `queue_update` before the prompt's
   answer; the abort's answer before and after `agent_settled`; the store
   idempotent on `running: false`, on the queue, and filling the draft
   once. The fake host sends `queue_update` before the `queued` answer,
   as Pi does (engineer 7; quality-assurance 4; ai-engineer 5).
9. **Roles verified and tested.** Mirror's context message is `custom`;
   `reduceRows` draws a user `message_end` and ignores `custom` and
   `toolResult`, with tests (engineer 8; quality-assurance 7; ai-engineer
   5).
10. **Pi's expanded text is what the queue, the echo and the withdrawn
    lists carry**, said in D3, D5 and D6 as a recorded fact (terminal Pi's
    "Steering: …" shows the same), the "as typed" claim scoped to the
    prompt's optimistic row, a store test with an echo that differs from
    what was typed, and the fake host neither expanding nor claiming to
    prove it. All three lenses that raised it recommend accepting Pi's
    form for US2 (quality-assurance 11, R4; ai-engineer 4, R3; security 4,
    R3).
11. **A rejection after preflight has a shape in the seam.** `acceptPrompt`
    takes an `onLateFailure` the registry wires to the extension-failure
    event; the test asserts it is surfaced, not merely unanswered
    (engineer 9).
12. **One merge for every return to the draft**, terminal Pi's:
    returned texts then the typed text, each trimmed-empty one dropped,
    joined by blank lines, never discarding; used by the stop, a refusal,
    `handled` and the connection's loss; the empty-draft case tested
    (engineer 5; experience-designer 6, 7).
13. **In-flight messages are state, so nothing is nowhere.** A
    `queueMessage` request is listed in the queue area as sending, with
    its kind, until Pi's `queue_update` names it or the answer comes;
    `connectionLost()` withdraws the queue view and the in-flight texts
    together, deduplicated by text, and a request the loss rejects
    restores nothing itself, so no message is restored twice
    (experience-designer 5; quality-assurance 8; ai-engineer 7).
14. **The fake host's stop is faithful during a tool call** and
    complete: the empty `queue_update` first; an open tool ended with an
    error result; an open assistant message ended with its text so far,
    else an empty aborted one; `errorMessage: "Request was aborted"` on
    it; `agent_end`, `agent_settled { aborted: true }`; the answer after;
    the disk records what played; a held turn stopped with events left
    is not "never played"; dequeue by first occurrence, tested with two
    identical steers (engineer 12; quality-assurance 5, 12; ai-engineer
    8).
15. **A failed `session.abort` is said**: a toast, the queue left as the
    events say (engineer 13).
16. **The content net covers queued text**: the fake host runs
    `contentProblem` over a `session.prompt` it queues, as a violation
    (security 6).
17. **"Stop puts them back in the draft."** One muted line after the
    queue list while it is non-empty, the terminal's hint in the
    terminal's place (experience-designer 2, R4).
18. **The queue line's form is the terminal's**: "Steering: " and
    "Follow-up: " as text, one line, an ellipsis (experience-designer 3).
19. **The buttons**: Steer with the send glyph and `aria-keyshortcuts
    "Enter"`, Follow up with a corner-down-right glyph and `"Alt+Enter"`,
    Stop after a gap with its square; focus returns to the text box when
    the draft is restored (experience-designer 8, 9, 10).
20. **D9 says where the mark lands after a tool**: after the tool's error
    result, as an empty stopped answer, since Pi streams one more aborted
    message there (quality-assurance 5).
21. **The route**: `mirror conversations` read after step 1 as the
    baseline; a check after step 3 that the steered turn is one Mirror
    turn; step 10 cut, the refusal and `handled` paths moved to
    "consciously left out", since Mirror registers no command to provoke
    them (quality-assurance 13; ai-engineer 9).
22. **The test guide says what the tests cannot prove**: answer-versus-
    event order in a real host, the withdrawn-and-delivered window, the
    role of injected messages, expanded text, and that the `started` race
    is provable only against the stub (quality-assurance 15).

**Not taken:**

- Refusing a `/`-prefixed steer in the host before Pi (engineer R2 (b),
  security 3): it adds command parsing the host cannot keep faithful; Pi's
  behavior is accepted and `handled` is told (R2).
- Disabling Steer and Follow up until the prompt's answer
  (quality-assurance R1 (a)): the host's serialization closes the race for
  every client, and the sending line (defect 13) keeps the screen honest.
- Keeping the typed form per queued message in the host or the UI
  (quality-assurance R4 (b), ai-engineer R3 (b), security R3 (b)): queue
  state of the host's own, against D10, and a match from expanded to
  typed text the UI cannot make.
- Serializing all requests per session: only prompts race Pi's check;
  the abort must stay able to overtake a prompt.

## What holds, in the reviewers' words

Every lens confirmed from the sources that Pi queues and throws in
`prompt()` and reports through `preflightResult` only on acceptance; that
`queue_update` is emitted on enqueue, on dequeue before the echo, and on
`clearQueue()`; that `abort()` leaves the queue and `clearQueue()` empties
both the session's lists and the agent's; that a failed run continues
with the queue, steering first; that every delivered message is echoed;
that terminal Pi's Escape order is queued text then the editor's; that
Mirror's `input` hook ignores a queued input and `agent_settled` sends one
reply; that D1 over two requests holds for a stronger reason than the plan
gave (`steer()` on an idle session queues without starting a run); and
that the slice order and the `turnControl.ts` seam are right.
