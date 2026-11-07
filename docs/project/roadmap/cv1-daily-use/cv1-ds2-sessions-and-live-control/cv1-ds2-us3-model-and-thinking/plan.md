[< Story](index.md)

# Plan — CV1.DS2.US3

## Objective

Let the person see and choose a session's model and thinking level from
the conversation's header, the way `/model` and `/thinking` choose them in
terminal Pi: session-only, recorded in the session's file, the default
taken from Pi's settings and never written back.

Three moments need one rule, because the header always says what the
session shown runs on next:

- **looking at a session** that is not open, where nothing may be written
  (D14);
- **the first send**, which opens the session on the choice;
- **the open session**, idle or answering, where a change reaches Pi at
  once.

No DS2 Planning Input names this story. Inputs 1 and 2 stay with TS1.

Read from the code, not guessed (Pi 1.4.0, `mirror-mind` 0.38.0):

- **Pi records a session's model and level in its file, and resumes from
  them.**
  - A new session starts with a `model_change` and a
    `thinking_level_change` entry (`core/sdk.js`).
  - `setModel` appends a `model_change`. `setThinkingLevel` appends a
    `thinking_level_change`, but only when the level actually changes.
  - A resume restores the branch's last model (`getBranchSelection`) only
    when Pi still knows the model and its provider has a credential
    (`getModel`, `hasConfiguredAuth`). Otherwise it falls back to the
    default and says so in `modelFallbackMessage`. `sessions.ts` ignores
    that message today.
  - The level is the branch's last one when the file has a level entry,
    else the settings' default.
- **How the choice reaches a new or a resumed session.**
  - `createAgentSession({ model, thinkingLevel })` starts a new session on
    them and records them as its first entries, exactly as
    `pi --model … --thinking …` does.
  - For a resumed session, the same options override what is restored but
    are not recorded. The next `pi -r` would restore the old model.
  - So a resumed session takes a choice through `setModel` and
    `setThinkingLevel`, as `/model` after `pi -r` does.
- **`setModel(model, { persist })` behaves like terminal Pi's `/model`.**
  - It checks the credential and throws `No API key for <provider>/<id>`
    when there is none.
  - It applies Pi's switch rule to the level: the per-model setting, else
    the global default, else the current level, clamped.
  - It records the change and emits `model_select` to extensions.
  - It writes `settings.json` only with `persist: true`. Terminal Pi's
    `/model` and `/thinking` select for the session only on Enter. A
    separate key sets the default. Ctrl+P and Shift+Tab never persist.
- **Thinking levels belong to the model.**
  - `getSupportedThinkingLevels(model)` (`pi-ai`) is `["off"]` for a model
    without reasoning. Otherwise it is a subset of off, minimal, low,
    medium, high, xhigh, max, read from the model's `thinkingLevelMap`.
  - `clampThinkingLevel` takes the nearest supported level upward, else
    downward.
  - The Navigator's 25 available models (17 Anthropic, 8 OpenAI Codex)
    differ: `claude-sonnet-5-5` has low to max and no off, `claude-haiku-4-5`
    has off to high, `gpt-6-astra` has minimal to max. So the level list
    depends on the model, and a level can vanish when the model changes.
- **A change during a run reaches Pi's next request in that run.**
  - The coding agent hands the agent loop `agent.state.model` and
    `thinkingLevel` before every request after the first
    (`_installAgentNextTurnRefresh`). The request already streaming keeps
    its own.
  - Terminal Pi's Ctrl+P and Shift+Tab work while it streams.
- **A change and a prompt can race.**
  - The server answers requests concurrently, and `setModel` awaits
    `checkAuth` before it applies anything.
  - A prompt sent right after a change could therefore reach `prompt()`
    first and run on the old model. US2 serialized prompts per session on
    `accepting` for the same kind of reason (D17).
- **Pi's default for a new session is `findInitialModel`, which Pi does not
  export.**
  - It uses the settings' `defaultProvider`/`defaultModel` when Pi knows
    the model and has its credential, else a per-provider table, else the
    first available model.
  - The level is the per-model setting, else `defaultThinkingLevel`, else
    `medium`, clamped.
  - The settings are global and project (`SettingsManager.create(cwd,
    agentDir)`), which is what the open already uses.
  - The Navigator's settings: `anthropic`/`claude-sonnet-5-5`, `medium`. No
    `enabledModels`, no per-model levels.
- **What the UI knows today.**
  - `models.available` answers Pi's `getAvailable()` with `reasoning` but
    no levels.
  - The UI keeps only whether that list is empty (`canUseModels`). A
    sign-in sets it to true without reading the list.
  - The header shows `provider/id` and `thinking <level>` as muted text,
    and only once the session shown is open (`Conversation.tsx`). The
    store keeps the model as a string.
- **Pi says a level change, not a model change.**
  - `setThinkingLevel` emits the session event `thinking_level_changed`.
    A model change exists only as the extension event `model_select`.
  - The projection forwards neither, so the screen learns a change from
    the host's answers.
- **Two more code facts.**
  - `pi-ai` 1.4.0 is installed: `pi-coding-agent` 1.4.0 pins it exactly.
    The host imports its types (`auth.ts`) but none of its code.
  - The sessions list (`SessionsList.tsx`) is the pattern for a header
    list: an ARIA listbox that takes Escape first (the overlay rule in
    `useEscapeToStop.ts`, which names this story's lists) and reads again
    when opened. Its keyboard and outside-click handling would be
    duplicated by two more lists.
- **Mirror never reads the session's model.** Its logger and the
  `mirror mirror load` binding do not look at it. A change is nothing to
  Mirror, and there is no Core-owned prerequisite.

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | What is chosen, from what | **Pi's available models, and the levels Pi supports for each.** The list is `models.available` as today (Pi's `getAvailable()`: every model whose provider has a credential), in Pi's order, unfiltered, as terminal Pi's `/model` lists "all". `AvailableModel` gains `thinkingLevels`, from Pi's own `getSupportedThinkingLevels`, so the UI never derives a level list itself. |
| D2 | What the header shows | **What the session shown runs on next, always, as two controls.** The muted `provider/id` and `thinking <level>` become buttons, each opening a list. They are shown whenever the conversation can send (a project path, a model to use), not only once open. The value depends on the session shown. The open session: its own, as the host last answered. A file not open: what resuming it starts with (D4). A new session: the Journey's default (D3). In the last two cases the person's choice (D5) wins. The controls are not drawn until that value is known (the first read pending or failed). A model whose only level is `off` shows `thinking off` as text, with nothing to pick. |
| D3 | The default, from Pi's settings | **`sessions.list` answers with `defaults`, what a new session in the Journey's project starts with.** The host resolves Pi's start rule with Pi's public pieces: `SettingsManager.create(cwd, agentDir)` as the open builds it, `getModel` and `hasConfiguredAuth`, and `pi-ai`'s clamp. The model is the settings' default when Pi can use it. Otherwise `model` is absent and the header says "Pi's default", because the per-provider fallback Pi would take is not exported; the open's answer then names it. The level is the per-model setting, else the default, else `medium`, clamped. Re-reading the list after each turn (US1) also re-reads a default terminal Pi changed. This reproduces part of `findInitialModel`, which is a drift risk at a Pi upgrade: the open's answer stays the truth, and a stop condition watches the two agree. |
| D4 | A file's own | **`session.transcript` answers with `resumes`, what resuming the file starts with.** The read already opens the file with Pi's `SessionManager`. The host takes the branch's model and level from Pi's `buildSessionContext()`. It keeps the model when Pi can use it and falls back to D3's default when not. It keeps the level when the file records one, else the default, clamped to the model. When Pi does fall back at open, its `modelFallbackMessage` becomes one more line in the open's `diagnostics`, which the transcript already shows where the session begins. Pi's words carry no path. |
| D5 | A choice before the first send | **Held in the conversation, sent with the first send, applied as the terminal would.** The conversation keeps `choice` for the session shown and sends nothing (D14). Showing another session drops it. The first send carries it on `session.open` (`model?`, `thinkingLevel?`), only what was chosen, so a send with no choice is today's request. Before anything closes, the host checks that Pi knows the model and has its credential. If not, it refuses with `model_not_available` in its own words, and the existing failed-open path puts the message back in the draft and says why. A new session gets the choice as `createAgentSession`'s options, recorded as its start. A resumed one gets it through `setModel` and `setThinkingLevel`, session-only, once Pi has started it, and only what differs from what Pi restored. The open's answer is the truth, and the choice is cleared. |
| D6 | A choice on the open session | **A new request, `session.configure { sessionId, model?, thinkingLevel? }`, answered with what the session runs on after it** (`model?`, `thinkingLevel`). The host calls `setModel` and then `setThinkingLevel`, never with `persist`. It serializes the change on the session's `accepting` chain with prompts, so a change sent before a prompt reaches Pi before that prompt. A model Pi does not know, or has no credential for, is refused with `model_not_available` in the host's words. A level the model lacks is clamped by Pi, and the answer says what it became. The UI shows the answer. A refusal is said once as a toast, and the header keeps the session's values. The answer, not an event, updates the screen, because Pi emits no model event. |
| D7 | The level when the model changes | **Kept, clamped to what the new model supports (R1).** The two controls are independent on screen, so a level the person picked stays put unless the new model lacks it, and then moves to the nearest supported level upward, else downward. Before the first send, the UI shows that with Pi's clamp, carried from `pi-ai` 1.4.0 with its provenance into the pure choice rules. On the open session, it asks for the model and the shown level together, and Pi clamps. Pi's switch rule (per-model setting, else global default) does not apply to a pick in the app. *Alternative:* Pi's switch rule. With the Navigator's settings it resets the level to `medium` on every model change, and showing that before the first send needs each model's switch level from the host. |
| D8 | While a turn runs | **Allowed, applied from Pi's next request (R2).** It works as terminal Pi's Ctrl+P and Shift+Tab do mid-stream: the request in flight keeps its model, and the next step uses the new one. The header shows the change at once, and the list says "Pi takes it at its next step." while a turn runs. While the session opens, both controls are disabled, because the open already carries the choice. *Alternative:* disabled while a turn runs, like the sessions list. That is simpler to validate, but a long run could only be deepened by stopping it. |
| D9 | Pi's settings | **Never written (R3).** No `persist`, no "set as default". The default comes from Pi's settings and is changed where terminal Pi changes it. Validation reads `settings.json` before and after. |
| D10 | The lists | **One listbox behavior, three lists.** The sessions list's popover (open and close, the arrows, Home and End, Enter, Escape taken first, outside click, the active option kept in view) is extracted into one header-list component under `SessionsList.tsx`'s existing tests, unchanged, and the model and thinking lists use it. The model list shows each model by its id with its provider beside it, as Pi's `/model` lists them, and Pi's default marked `default`. Opening it reads `models.available` again, as the sessions list re-reads. The thinking list shows the model's levels in Pi's order, each with Pi's description (carried from `ThinkingSelectorComponent`, with provenance). The current one is marked in both lists. |
| D11 | The models in the UI | **The host store keeps the list, not only whether it is empty.** `hostReady` takes the models, and `canUseModels` becomes the list being non-empty. A sign-in reads the list again instead of setting a flag. The conversation's open `Session` keeps its model as a `ModelRef`, and the label is drawn from it. |
| D12 | The fake host | **Keeps the real host's rules for the model, and records them on its disk.** `sessions.list` answers `defaults`: the world's, per Journey, else the first model and `medium`, which is what its open answers today. `session.transcript` answers `resumes` from the scripted session's `model` and `thinkingLevel`, else the defaults. `session.open` and `session.configure` take a choice, refuse a model the world does not list with `model_not_available`, and record a level the model does not list as a violation, because the UI must offer only the model's levels, so a request for another is a UI bug, not Pi's clamp. The disk keeps each session's model and level as the open and every change leave them, so a session read back shows what it ran on. `failures` learns `session.configure`. |
| D13 | The protocol | **One new request, three new fields on answers, two on `session.open`, one code, one bump.** `ModelChoice { model?: ModelRef; thinkingLevel: string }`. `AvailableModel.thinkingLevels`. `sessions.list`'s `defaults` and `session.transcript`'s `resumes`, both `ModelChoice`. `session.open`'s optional `model` and `thinkingLevel`. `session.configure`, request and result. The `model_not_available` error. `PROTOCOL_VERSION` 0.6.0 → 0.7.0, since an older host would strip the choice and open on the default. A level stays a string checked against the model's list, not an enum that would fail a Pi upgrade adding a level at the socket. |
| D14 | `pi-ai` as the host's dependency | **Declared, pinned to 1.4.0 (R4),** the version `pi-coding-agent` 1.4.0 pins and installs today. It is for `getSupportedThinkingLevels` and `clampThinkingLevel`, the functions `AgentSession` itself calls. Nothing new is installed or shipped. *Alternative:* reimplement the two in the host, which forks Pi's rule a second time. |

## Scope

1. **The protocol** (D13): `ModelChoice`; `AvailableModel.thinkingLevels`;
   `defaults` on `sessions.list`; `resumes` on `session.transcript`;
   `model?` and `thinkingLevel?` on `session.open`; `session.configure`
   with at least one of the two; `model_not_available`; the bump. Schema
   tests in `packages/protocol/src/index.test.ts` for each, including a
   configure with neither field (refused) and a result without
   `thinkingLevel` (refused).

2. **The host.** All of it in `packages/host/src/`:
   - **`modelChoice.ts`**, pure over stubs of `SettingsManager`'s getters,
     `ModelRuntime`'s `getModel` and `hasConfiguredAuth`, a recorded
     branch, and the session's `model`, `thinkingLevel`, `setModel` and
     `setThinkingLevel`.
     - `startingChoice(settings, runtime, recorded?)` is D3 and D4 in one
       rule.
     - `usableModel(runtime, ref)` is the check D5 and D6 refuse on.
     - `applyChoice(session, choice)` applies only what differs, the model
       before the level, never with `persist`, and answers what the
       session runs on after. Both the open of a resumed session and
       `configure` use it.
     - `modelChoice.test.ts` covers: the settings' default, usable and
       not; a per-model level over the default; the default over
       `medium`; the clamp both ways; a recorded model, usable and not; a
       recorded level, present and absent; a model without reasoning
       giving `off`; `applyChoice` calling nothing for a choice equal to
       the session's, the model before the level, and never `persist`.
   - **`auth.ts`**: `available()` adds `thinkingLevels`.
   - **`sessions.ts`**:
     - The open validates the choice before anything closes. A new
       session gets it as `createAgentSession` options. A resumed one gets
       `setModel` and `setThinkingLevel` after `bindExtensions`, for what
       differs.
     - `modelFallbackMessage` is added to `diagnostics`.
     - `configure(sessionId, choice)` runs on the same per-session chain
       as `prompt`. The chain becomes one small helper both use, tested
       over a stub in `turnControl.test.ts`: a change sent before a
       prompt reaches the session first, and a refused change does not
       block the next prompt. `SessionRegistry` itself stays covered by
       the real turn, as in US2.
   - **`server.ts` and `transcript.ts`**: `server.ts` answers
     `defaults` with the list, and `transcript.ts` answers `resumes` with
     the read. `server.ts` also routes `session.configure` and maps
     `ModelNotAvailableError`.
   - **`scripts/turn.ts`**: gains `--model <provider/id>` and
     `--thinking <level>`, passed on `session.open` and printed from its
     answer, so the gate's real turn proves the open-with-choice path
     against Pi.

3. **The fake host** (D12): `defaults` per Journey in the world; `model`
   and `thinkingLevel` on a scripted session; the choice at open;
   `session.configure`; the disk recording both; the violation for an
   unlisted level; `failures` for `session.configure`. Tests in
   `fakeHost.test.ts`. `worlds.ts`: `model` gains its levels, and two
   invented models join it, one with levels low to max (no `off`) and
   one without reasoning.

4. **The UI's data** (D2, D5–D8, D11).
   - **The host store** keeps the models; `connect.ts` passes them; a
     sign-in reads them again.
   - **`conversations/modelChoice.ts`**, pure, beside `liveTurn.ts`:
     - `shownChoice(conversation)` gives what the header shows;
     - `pickModel` and `pickLevel` give the next choice, with D7's clamp;
     - `clampLevel(level, levels)` is carried from `pi-ai` 1.4.0.
     - Tests in `modelChoice.test.ts` cover each source of the shown
       value, each pick, and the clamp against `pi-ai`'s cases.
   - **The store**:
     - `defaults` is kept on the sessions list, and `resumes` from the
       read, cleared with what is shown.
     - `choice` is dropped by `showing()`.
     - `send()` carries the choice on `session.open` and clears it on its
       answer.
     - `chooseModel(client, journeyId, model)` and
       `chooseThinking(client, journeyId, level)` change the choice, or
       send `session.configure` for the open session. They reject on
       refusal, so the header can say why, and say nothing on
       `connection_lost`.
     - The open `Session` keeps a `ModelRef`.
     - Tests in `store.test.ts` against the stub connection. Among them:
       a choice dropped by a look; a send carrying it and the answer
       replacing it; a configure answered with a clamped level; a refused
       configure leaving the session's values; a configure while running.

5. **The header** (D2, D8, D10). Header-list behavior is extracted from
   `SessionsList.tsx`. `ModelList.tsx` and `ThinkingList.tsx` sit in
   `Conversation.tsx`'s header after the path; `useEscapeToStop.ts`'s
   comment is updated. UI tests in a new `shell/ModelAndThinking.test.tsx`
   against the fake host:
   - the header before any send, for a file with its own model and for a
     new session with the defaults;
   - a pick before the first send and the `session.open` it carries, with
     no request before the send;
   - a pick dropped by a look;
   - a pick on the open session and the `session.configure` it sends;
   - a level clamped by a model change;
   - the thinking list showing only the model's levels;
   - `thinking off` as text for a model without reasoning;
   - a refused open and a refused configure;
   - Escape with a list open during a held turn closing the list and
     leaving the turn running;
   - both controls disabled while the session opens.

   `SessionsList.test.tsx` is unchanged and green. The tokens net holds
   the new classes.

6. **Docs.**
   - AGENTS.md: the protocol's new request in the fake-host bullet, and
     `defaults`, `resumes` and the model on the disk.
   - The headers of `sessions.ts`, `fakeHost.ts`, `fakeDisk.ts`,
     `conversations/store.ts` and `Conversation.tsx`.
   - At Done:
     - a decision `D18` in `decisions.md`: a session's model and level are
       chosen as Pi's `/model` and `/thinking` choose them, session-only,
       recorded in the file, the default read from Pi's settings and never
       written;
     - this story's index, and the CV1.DS2 candidate table;
     - the worklog.

## Non-Goals

- Setting Pi's default model or level from the app (R3). Terminal Pi
  stays where the default is changed, and the header shows the change at
  the next look.
- Scoped models (`enabledModels`, `--models`) and the cycling keys
  (Ctrl+P, Shift+Tab, `app.thinking.cycle`). The Navigator has no scope,
  and the lists are the mouse's and the keyboard's way in.
- Pi's per-model thinking settings applied when the model changes (D7,
  R1).
- Showing live a model or level that an extension (`pi.setModel`) or a
  virtual model's routing (`routedModel`) sets. Pi emits no model event to
  forward. The header shows what the host last answered, and the next open
  or read shows the file.
- The model of each session in the sessions list: it needs every file's
  model at list time, which the head-only list read (decision D7, as
  built in US1) does not reach.
- A search or filter in the model list. Twenty-five models fit the list;
  revisit when daily use outgrows a screen.
- Refreshing provider catalogs (terminal Pi's `/model` refresh), signing
  out, and anything else in sign-in.
- Hiding thinking in the transcript (`hideThinkingBlock`).
- A model the open session runs on that has since lost its credential:
  the next prompt is refused in the host's words (US2), and picking
  another model is the way out.
- Any change to the Mirror core or the Rust shell. Reconnecting, restart
  and lifecycle stay CV1.DS2.TS1's.

## Acceptance Behavior

```text
Given Garden's most recent session recorded on anthropic/claude-deep at level high
When the person picks Garden
Then the header shows "anthropic/claude-deep" and "thinking high", read with the file, and no session.open was sent

Given a new session shown in Garden, whose defaults are anthropic/claude-test at medium
When nothing has been chosen
Then the header shows "anthropic/claude-test" and "thinking medium"
And the model list marks anthropic/claude-test "default", and the thinking list shows only claude-test's levels, each with Pi's description, medium marked current

Given a new session shown in Garden
When the person picks anthropic/claude-deep, then thinking low, and sends "Hello"
Then before the send no request was made for the choice; the host receives session.open with journey garden, model anthropic/claude-deep and thinkingLevel low, then the prompt
And the header shows what the open answered

Given a new session shown with thinking off on anthropic/claude-test
When the person picks anthropic/claude-deep, whose levels are low to max
Then the header shows "thinking low" without a request

Given a choice made for a new session that was never sent
When the person shows an older session, then "New session" again
Then the older session shows its own model and level, and the new session the defaults again

Given Garden's open session shown, idle
When the person picks anthropic/claude-deep
Then the host receives session.configure with that model and the shown level, the header shows the answer, and the next session.prompt follows it
And a session read back from the fake host's disk shows the model and level it was left on

Given Garden's open session answering a held turn
When the person picks thinking high, then opens the model list and presses Escape
Then session.configure is sent while the turn runs, the list said Pi takes it at its next step, the list closes on Escape, and the turn is still running

Given a model the host answers model_not_available for
When it is picked for the open session
Then the toast says the host's words once and the header keeps the session's values
And when it is the choice of a send that opens the session, the message is back in the draft and the conversation says the session could not open, with the host's words

Given a resumed file whose model Pi cannot use
When the send opens it
Then the transcript shows Pi's fallback line where the session begins, and the header shows the model the open answered

Given the session's model has no reasoning
When the header is drawn
Then it shows "thinking off" as text, with no list

Given a session opening
When the header is drawn
Then both controls are disabled until the open answers
```

## Validation Route

Automated, from the repository root: the gate (`npm run typecheck`,
`npm test`, `npm run build`, `git diff --check`) and the story's tests as
[test-guide.md](test-guide.md) lists them. The host changes how it drives
Pi, since it opens a session on a choice and changes a model on an open
session. So the gate includes one real turn on a Journey the Navigator
names, with a choice:
`npm run turn --workspace packages/host -- --journey <slug> --model anthropic/claude-haiku-4-5 --thinking low --prompt "Reply with the single word: pong"`.
It must answer, and print the open's model and level as asked.
`cargo check` is not in the gate: the shell does not change.

Navigator, in the window (`npm run dev`), on a Journey the Navigator names
(the automation Journey served US1 and US2), with a terminal open in that
Journey's project path. Before step 1, record the default in the terminal:
`grep -E '"default(Provider|Model|ThinkingLevel)"' ~/.pi/agent/settings.json`.

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick the Journey; then in the terminal, `pi -r` and pick the same session, and quit without sending | Before any send, the header shows a model as `provider/id` and `thinking <level>`; the terminal's footer shows the same model and level for that session |
| 2 | Pick "New session" | The header shows `anthropic/claude-sonnet-5-5` and `thinking medium`, the defaults recorded before step 1 |
| 3 | Open the thinking list; press Escape | It lists low, medium, high, xhigh and max, each with Pi's description, medium marked; no off, no minimal; Escape closes it |
| 4 | Open the model list; pick `claude-haiku-4-5`; open the thinking list; pick low | The model list shows the models with their providers and `claude-sonnet-5-5` marked default; the header shows `anthropic/claude-haiku-4-5` and `thinking medium`, then `thinking low`; the thinking list lists off, minimal, low, medium, high; `pi -r` lists no new session |
| 5 | Send "Which model are you, in one line?"; when it settles, `pi -r` the new session and quit without sending | The answer streams; the header still reads haiku and low; the terminal's footer shows `claude-haiku-4-5 • low` |
| 6 | Set thinking to off; pick `openai-codex/gpt-6-luna`; send "Which model are you, in one line?" | The header shows `thinking off` kept, then the GPT model; the answer comes from it; `pi -r` shows `(openai-codex) gpt-6-luna • thinking off` |
| 7 | Pick `anthropic/claude-sonnet-5-5` | The header shows `thinking low`: off is not one of its levels, and low is the nearest above |
| 8 | Send a prompt that takes several tool calls ("List the top-level folders of this project one at a time, with a sentence on each, using one tool call per folder"); while it runs, pick thinking high; then open the model list and press Escape | The turn runs on uninterrupted; the thinking list said Pi takes it at its next step; the header shows `thinking high` at once; Escape closes the list and the turn goes on; when it settles, `pi -r` shows `• high` |
| 9 | Show the haiku session from step 5 in the sessions list; send "And now?" | Before sending, the header shows `anthropic/claude-haiku-4-5` and `thinking low`, read from its file; the answer comes from haiku |
| 10 | Quit the app, relaunch, pick the Journey | The header shows the most recent session's model and level as it was left |
| 11 | In the terminal, run the `grep` from before step 1 again | The three lines are exactly as recorded: the app wrote nothing to Pi's settings |

**Pass:** every observation holds. **Fail:** any does not, or one of
these happens:

- the header shows a model or level other than the one the next answer
  runs on;
- a choice made before a send opens or writes anything;
- a change on the open session is lost by the next `pi -r`;
- a change during a run stops, fails or restarts the turn;
- Escape with a list open stops a turn;
- Pi's settings change.

Consciously left out of the window, and proven against the fake host and
the stubs only:

- a model Pi refuses, at open or on the open session, since that needs a
  provider signed out mid-session;
- Pi's settings naming no usable default, a file whose model Pi cannot
  restore, and Pi's fallback line;
- a model without reasoning, since all 25 of the Navigator's models
  reason;
- the order of a change and a prompt sent at once (D6), which the stub
  stages and a hand cannot.

E2E decision: required. The fake host proves every path in the UI and the
stubs prove the host's rules. Only the window with Pi proves four things:

- Pi answers on the chosen model at the chosen level;
- the file records the choice, so `pi -r` resumes on it;
- a change made during a run reaches Pi's next step and leaves the run
  intact;
- the header's defaults and a file's own values agree with what Pi opens.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS2.US3`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- One dependency, named here: `@earendil-works/pi-ai` 1.4.0 in
  `packages/host` (D14, R4), already installed. No change to the Mirror
  core or `apps/desktop/src-tauri`.
- The protocol first, then the host, then the UI, as AGENTS.md orders a
  new capability. Each slice is committed green:
  1. the protocol, the host's rules and wiring, and the fake host, which
     land together, as in US1 and US2, since the answers' shapes change
     under the server's exhaustive switch;
  2. the header-list extraction, alone and behavior-neutral, under
     `SessionsList.test.tsx`;
  3. the UI's data and the store;
  4. the two lists and the header, with the UI tests;
  5. the docs and comments.
- A real turn runs only on the Journey the Navigator names, at
  validation.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- In a real run, the open answers a different model or level than the
  header showed for a new session or a resumed file. The host's
  reproduction of Pi's start rule (D3, D4) has drifted from Pi 1.4.0;
  stop and re-read `sdk.js` before patching either side.
- A change made during a run does not reach Pi's next step, or makes the
  run fail (checked at validation step 8). R2 is then revisited toward
  disabling the controls while a turn runs.
- `buildSessionContext()` on a read measurably slows the largest known
  session's read (175 ms today, US1). The model and level are then taken
  from the branch the read already holds.
- At the window's minimum width (860), the header cannot fit the
  Journey's name, the sessions button, the path and both controls without
  hiding the name. The layout is then chosen with the Navigator.
- The listbox extraction cannot keep `SessionsList.test.tsx` green
  unchanged.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval, with R1–R4
  ruled:
  - **R1 (D7):** a model change keeps the level, clamped (recommended),
    or applies Pi's switch rule.
  - **R2 (D8):** a change during a run is allowed and taken at Pi's next
    step (recommended), or the controls are disabled while a turn runs.
  - **R3 (D9):** the app never writes Pi's settings (recommended), or it
    offers "set as default".
  - **R4 (D14):** declare `pi-ai` 1.4.0 (recommended), or reimplement its
    two level functions.
