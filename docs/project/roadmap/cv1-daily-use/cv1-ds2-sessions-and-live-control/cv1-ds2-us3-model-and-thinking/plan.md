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
  (decisions.md D14);
- **the first send**, which opens the session on the choice;
- **the open session**, idle or answering, where a change reaches Pi at
  once.

No DS2 Planning Input names this story. Inputs 1 and 2 stay with TS1.

This is the second version of the plan, revised after a five-lens review
and the Navigator's rulings on R1–R5, each the recommended option; see
[plan-review.md](plan-review.md).

Read from the code, not guessed (Pi 1.4.0, `mirror-mind` 0.38.0):

- **Pi records a session's model and level in its file, and resumes from
  them.**
  - A new session starts with a `model_change` and a
    `thinking_level_change` entry (`core/sdk.js`).
  - `setModel` appends a `model_change`. `setThinkingLevel` appends a
    `thinking_level_change`, but only when the level actually changes.
  - A resume restores the branch's last model (`getBranchSelection`, not
    exported) only when Pi still knows the model and its provider has a
    credential (`getModel`, `hasConfiguredAuth`). Otherwise it falls back
    to the default and says so in `modelFallbackMessage`. `sessions.ts`
    ignores that message today.
  - The level is the branch's last one when the branch holds a
    `thinking_level_change` entry (`hasThinkingEntry`), else the global
    default, with no per-model lookup on that path. A file with no
    messages takes the new-session rule.
  - `buildSessionContext()` cannot say whether a level was recorded: its
    `thinkingLevel` starts at `"off"` with no flag
    (`getSessionContextSettings`). Its model is the last `model_change`
    or the last assistant message, whichever is later on the path, which
    is Pi's resume rule for every physical model.
- **How the choice reaches a new or a resumed session.**
  - `createAgentSession({ model, thinkingLevel })` starts a new session on
    them and records them as its first entries, exactly as
    `pi --model … --thinking …` does.
  - For a resumed session, the same options override what is restored but
    are not recorded. The next `pi -r` would restore the old model.
  - So a resumed session takes a choice through `setModel` and
    `setThinkingLevel`, as `/model` after `pi -r` does.
- **`setModel(model, { persist })` behaves like terminal Pi's `/model`,
  and it moves the level itself.**
  - It awaits `checkAuth(provider)` and throws `No API key for
    <provider>/<id>` when there is none.
  - It applies Pi's switch rule to the level before anything else: the
    per-model setting, else the global default, else the current level,
    clamped. With the Navigator's settings that is `medium` on every
    model change.
  - It records the change, calls `setThinkingLevel` on that level, and
    then awaits `model_select` to extensions.
  - It writes `settings.json` only with `persist: true`. Terminal Pi's
    `/model` and `/thinking` select for the session only on Enter. A
    separate key sets the default. Ctrl+P and Shift+Tab never persist, and
    nothing in their bindings or in `cycleModel` refuses them while a run
    streams.
- **Thinking levels belong to the model.**
  - `getSupportedThinkingLevels(model)` (`pi-ai`, exported from its root)
    is `["off"]` for a model without reasoning. Otherwise it is a subset
    of off, minimal, low, medium, high, xhigh, max, read from the model's
    `thinkingLevelMap`.
  - `clampThinkingLevel` takes the nearest supported level upward, else
    downward, walking a canonical order `pi-ai` keeps but does not export.
  - The Navigator's 25 available models (17 Anthropic, 8 OpenAI Codex)
    differ: `claude-sonnet-5-5` has low to max and no off, `claude-haiku-4-5`
    has off to high, `gpt-6-astra` has minimal to max. So the level list
    depends on the model, and a level can vanish when the model changes.
    All 25 reason.
- **A change during a run reaches Pi's next request in that run.**
  - The coding agent hands the agent loop `agent.state.model` and
    `thinkingLevel` before every request after the first
    (`_installAgentNextTurnRefresh`, `prepareNextTurn`). The request
    already streaming keeps its own. A run with no further request takes
    the change at the next prompt.
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
  - `createAgentSession` then takes the level from the per-model setting,
    else `defaultThinkingLevel`, else `medium`, clamped.
  - The settings are global and project (`SettingsManager.create(cwd,
    agentDir)`), which is what the open already uses. Creating one reads
    only; the storage writes through its update path alone.
  - The Navigator's settings: `anthropic`/`claude-sonnet-5-5`, `medium`. No
    `enabledModels`, no per-model levels.
- **Pi's fallback message has two forms.** "Could not restore model p/id.
  Using p/id" when a fallback model is found, path-free; and
  `formatNoModelsAvailableMessage()` when none is, which embeds
  `getProviderLoginHelp()` and with it two absolute paths.
- **What the UI knows today.**
  - `models.available` answers Pi's `getAvailable()` with `reasoning` but
    no levels.
  - The UI keeps only whether that list is empty (`canUseModels`). A
    sign-in sets it to true without reading the list.
  - The header shows `provider/id` and `thinking <level>` as muted text,
    and only once the session shown is open (`Conversation.tsx`), inside
    one `<p … truncate>` with the path, which clips its flex children
    without an ellipsis. The store keeps the model as a string.
  - The sidebar is 18rem; at the window's minimum width (860) the header
    holds about 530px.
- **Pi says a level change, not a model change.**
  - `setThinkingLevel` emits the session event `thinking_level_changed`.
    A model change exists only as the extension event `model_select`.
  - The projection forwards neither, so the screen learns a change from
    the host's answers.
- **Two more code facts.**
  - `pi-ai` 1.4.0 is installed: `pi-coding-agent` 1.4.0 pins it exactly.
    The host imports its types (`auth.ts`) but none of its code.
    `stage-host.mjs` installs the host's declared dependencies into the
    staging directory.
  - The sessions list (`SessionsList.tsx`) is the pattern for a header
    list: an ARIA listbox that takes Escape first (the overlay rule in
    `useEscapeToStop.ts`, which names this story's lists) and reads again
    when opened. Its keyboard and outside-click handling would be
    duplicated by two more lists.
- **Mirror never reads the session's model.** Its logger has no
  `model_select`, `thinking_level_select`, `ctx.model` or usage read, and
  the `mirror mirror load` binding does not look at it. A change is
  nothing to Mirror, and there is no Core-owned prerequisite.
- **Virtual models** are registered only by extensions
  (`registerVirtualModel`); the Navigator has none.

## Decisions proposed

| | Decision | Proposal |
|---|---|---|
| D1 | What is chosen, from what | **Pi's available models, and the levels Pi supports for each.** The list is `models.available` as today (Pi's `getAvailable()`: every model whose provider has a credential), in Pi's order, unfiltered, as terminal Pi's `/model` lists "all". `AvailableModel` gains `thinkingLevels`, from Pi's own `getSupportedThinkingLevels`, so the UI never derives a level list itself. |
| D2 | What the header shows | **What the session shown runs on next, always, as two controls.** The muted `provider/id` and `thinking <level>` become buttons, each opening a list, drawn whenever the conversation can send (a project path, a model to use). The value depends on the session shown. The open session: its own, as the host last answered. A file not open: what resuming it starts with (D4). A new session: the Journey's default (D3). In the last two cases the person's held pick (D5) wins and is drawn in `text-ink`, not `text-muted`. While the first read is pending or failed, each control is a dim `…` placeholder, disabled, as `Sessions…` is. When no usable default is known (D3), the model control reads "Pi's default" and the thinking control is an inert placeholder until a model is picked. A model whose only level is `off` shows "no thinking", boxed like the control, with no chevron, no hover and a title "This model does not reason." |
| D3 | The default, from Pi's settings | **`sessions.list` answers with `defaults`, what a new session in the Journey's project starts with.** The host resolves Pi's start rule with Pi's public pieces: `SettingsManager.create(cwd, agentDir)` as the open builds it, `getModel` and `hasConfiguredAuth`, and the shared clamp (D7). The model is the settings' default when Pi can use it. Otherwise `model` is absent, because the per-provider fallback Pi would take is not exported; the open's answer then names it. The level is the per-model setting, else the default, else `medium`, clamped to the model when there is one. The store keeps `defaults` across the list's `loading`; `startNewSession` and the list's opening read it again, so a default terminal Pi changed is seen. A Journey whose list cannot be read keeps the placeholders and sends on Pi's default, which the open's answer names. This reproduces part of `findInitialModel`: a parity test against `createAgentSession` (Scope 2) and a stop condition watch the drift. |
| D4 | A file's own | **`session.transcript` answers with `resumes`, what resuming the file starts with, by Pi's own resume rule.** The read already opens the file with Pi's `SessionManager`; the host scans `getBranch()`: the model is the last `model_change` or the last assistant message, whichever is later; it is kept when Pi can use it and falls back to D3's default when not. The level is the last `thinking_level_change` when one is on the branch, else the global default with no per-model lookup, clamped to the model. A file with no messages takes D3's rule. When Pi does fall back at open, its "Could not restore model" line becomes one more line in the open's `diagnostics`, which the transcript already shows where the session begins, unless a held pick overrides the model, in which case the line is not added; the no-models form, which carries paths, is replaced by the host's own line, "No model is available: sign in first." |
| D5 | A choice before the first send | **Held in the conversation as a pair, sent with the first send, applied as the terminal would.** The conversation keeps `pick` for the session shown and sends nothing (decisions.md D14). Showing another session drops it. The first send carries both fields on `session.open` (`model`, `thinkingLevel`), so a send with no pick is today's request. Before anything closes, the host checks that Pi knows the model and has its credential, by the check the prompt path uses (`hasConfiguredAuth`, else `checkAuth`). If not, it refuses with `model_not_available` in its own words, and the failed-open path puts the message back in the draft, keeps the pick so the header says what a retry would run on, marks the model control with the `danger` token until the pick changes, and says "Pick another model, then send again." A new session gets the pair as `createAgentSession`'s options, recorded as its start. A resumed one gets it through `applyChoice` (D6) once Pi has started it, and a failed apply closes the session the open registered, through `close()`, so Mirror closes the conversation it opened. The open's answer is the truth, and the pick is cleared by it. |
| D6 | A choice on the open session | **A new request, `session.configure { sessionId, model?, thinkingLevel? }`, answered with what the session runs on after it** (`ModelAndLevel`). The host's `applyChoice` calls `setModel` when the model differs, then `setThinkingLevel` with the wanted level unconditionally, since `setModel` has already moved the level by Pi's switch rule and Pi records only a change; never with `persist`. Accepted: the interim `thinking_level_change` Pi's switch rule writes, and the window in which the switch-rule level is live while `setModel` awaits its `model_select` event. The change is serialized on the session's `accepting` chain with prompts, so a change sent before a prompt reaches Pi before that prompt. A model Pi does not know, or has no credential for, is refused with `model_not_available` in the host's words, `setModel`'s own throw wrapped the same way. A level the model lacks is clamped by Pi as a backstop, and the answer says what it became. While the request is in flight both controls are busy (the `Pulse` glyph, `aria-busy`, picks ignored) and the header keeps the session's values; the answer updates it. A refusal is said once as a toast. The answer, not an event, updates the screen, because Pi emits no model event. |
| D7 | The level when the model changes | **Kept, clamped to what the new model supports (R1).** The two controls are independent on screen, so a level the person picked stays put unless the new model lacks it, and then moves to the nearest supported level upward, else downward. The rule is one function, `clampLevel(level, supported)` over `THINKING_LEVELS` in `packages/protocol`, used by the host and the UI and pinned to `pi-ai`'s `clampThinkingLevel` by a host test over every available model and every level. The UI sends only a level in the model's list, on the open and on configure. When a model pick moves the level, before the first send or in the configure's answer, one `role="status"` line in the composer's register says so: "claude-sonnet-5-5 has no off; thinking is now low." Pi's switch rule (per-model setting, else global default) does not apply to a pick in the app. *Alternative:* Pi's switch rule. With the Navigator's settings it resets the level to `medium` on every model change, and showing that before the first send needs each model's switch level from the host. |
| D8 | While a turn runs | **Allowed, applied from Pi's next request (R2).** It works as terminal Pi's Ctrl+P and Shift+Tab do mid-stream: the request in flight keeps its model, and the next request uses the new one. The header shows the change when the host answers, and each list's foot says, while a turn runs, "Pi takes it at its next request in this run, or at your next message." While the session opens, the lists open to show the value with their options disabled and one line, "Opening the session…", as the sessions list does while working. *Alternative:* disabled while a turn runs, like the sessions list. That is simpler to validate, but a long run could only be deepened by stopping it. |
| D9 | Pi's settings | **Never written (R3).** No `persist`, no "set as default". The default comes from Pi's settings and is changed where terminal Pi changes it. Validation diffs both settings files before and after. |
| D10 | The lists | **One listbox behavior, three lists.** The sessions list's popover (open and close, the arrows, Home and End, Enter, Escape taken first, outside click, the active option kept in view) is extracted into a `useListbox` hook under `SessionsList.tsx`'s existing tests, unchanged, with each list rendering its own button and options; the model and thinking lists use it. The two new controls are a right-anchored `shrink-0` pair with a tight gap, boxed like the sessions button (padding, hover, focus ring, chevron), so a box means a control and the unboxed path means a label; accessible names "Model: …" and "Thinking: …"; their popovers open right-aligned, the thinking list narrower. The model list shows each model's id, truncating, with its provider in meta, as Pi's `/model` lists them; Pi's default marked by a quiet `default` suffix. Opening it reads `models.available` again, as the sessions list re-reads. The thinking list shows the model's levels in Pi's order, each with Pi's description (carried from `ThinkingSelectorComponent`, with provenance), Pi's default level marked the same way. The current item is bold with `aria-selected` in both lists, and each list opens scrolled to it. |
| D11 | The models in the UI | **The host store keeps the list, not only whether it is empty.** `hostReady` takes the models, and `canUseModels` is the list being non-empty at that read; a later re-read replaces the list and never demotes readiness, and a failed re-read keeps the old list. `signedIn(client)` reads the list instead of setting a flag, and keeps readiness if the read fails. The conversation's open `Session` keeps its model as a `ModelRef`, and the label is drawn from it. |
| D12 | The fake host | **Keeps the real host's rules for the model, and records them on its disk.** `sessions.list` answers `defaults`: the world's, per Journey, else the first model and `medium`, which is what its open answers today. `session.transcript` answers `resumes` from the scripted session's `model` and `thinkingLevel`, else the defaults. `session.open` and `session.configure` take a choice, refuse a model the world does not list with `model_not_available`, and record a level the model does not list as a violation, because the UI must offer only the model's levels, so a request for another is a UI bug, not Pi's clamp. A world can script an open's `diagnostics`. The disk keeps each session's model and level as the open and every change leave them, so a session read back shows what it ran on. `failures` learns `session.configure`. |
| D13 | The protocol | **One new request, three new fields on answers, two on `session.open`, one code, one constant, one bump.** `ModelAndLevel { model?: ModelRef; thinkingLevel: string }` on `sessions.list`'s `defaults`, `session.transcript`'s `resumes`, and the configure result. `AvailableModel.thinkingLevels`. `session.open`'s optional `model` and `thinkingLevel`. `session.configure` with its two optional fields, at least one. The `model_not_available` error. `THINKING_LEVELS` and `clampLevel` (D7). `PROTOCOL_VERSION` 0.6.0 → 0.7.0, since an older host would strip the choice and open on the default. A level stays a string checked against the model's list, not an enum that would fail a Pi upgrade adding a level at the socket. |
| D14 | `pi-ai` as the host's dependency | **Declared, pinned to 1.4.0 (R4),** the version `pi-coding-agent` 1.4.0 pins and installs today, for `getSupportedThinkingLevels`, the function `AgentSession` itself calls, exported from the package's root. Nothing new is installed; staging installs it at the same version, and the bundle gate runs once in that slice. *Alternative:* reimplement it in the host, which forks Pi's rule. |

## Scope

1. **The protocol** (D13): `ModelAndLevel`; `AvailableModel.thinkingLevels`;
   `defaults` on `sessions.list`; `resumes` on `session.transcript`;
   `model?` and `thinkingLevel?` on `session.open`; `session.configure`
   with at least one of the two; `model_not_available`; `THINKING_LEVELS`
   and `clampLevel`; the bump. Schema tests in
   `packages/protocol/src/index.test.ts` for each, including a configure
   with neither field (refused) and a result without `thinkingLevel`
   (refused); `clampLevel` tested over `pi-ai`'s cases (upward first,
   downward else, an unknown level to the lowest supported).

2. **The host.** All of it in `packages/host/src/`:
   - **`modelChoice.ts`**, pure over stubs of `SettingsManager`'s getters,
     `ModelRuntime`'s `getModel`, `hasConfiguredAuth` and `checkAuth`, a
     branch of entries, and the session's `model`, `thinkingLevel`,
     `setModel` and `setThinkingLevel`.
     - `startingChoice(settings, runtime, branch?)` is D3 and D4 in one
       function with two paths.
     - `usableModel(runtime, ref)` is the check D5 and D6 refuse on, the
       prompt path's.
     - `applyChoice(session, choice)` calls `setModel` when the model
       differs, then `setThinkingLevel` unconditionally, never with
       `persist`, wraps `setModel`'s throw into `ModelNotAvailableError`,
       and answers what the session runs on after. Both the open of a
       resumed session and `configure` use it.
     - `modelChoice.test.ts` covers: the settings' default, usable and
       not; a per-model level over the default; the default over
       `medium`; the clamp both ways; a branch's last model from a
       `model_change` and from a later assistant message, usable and
       not; a recorded level, present and absent, the absent one taking
       the global default and not the per-model setting; a branch with
       no messages taking the new-session rule; a model without
       reasoning giving `off`; `applyChoice` over a stub whose `setModel`
       applies the switch rule, ending on the wanted level; the model
       set before the level; never `persist`; a throw wrapped.
     - A parity test over a temp agent dir (a settings file with and
       without per-model levels, a usable and an unusable default)
       compares `startingChoice` with what `createAgentSession` resolves
       for a new session, through `SessionManager.inMemory` and a
       resource loader over empty directories. It makes no request. If
       it cannot run hermetically, it is dropped, said in the test guide,
       and the stop condition stands.
     - A test pins `clampLevel` to `pi-ai`'s `clampThinkingLevel` over
       every model in a stub catalog and every level.
   - **`auth.ts`**: `available()` adds `thinkingLevels`.
   - **`sessions.ts`**:
     - The open validates the pair before anything closes, with
       `usableModel`. A new session gets it as `createAgentSession`
       options. A resumed one gets `applyChoice` after `bindExtensions`;
       a failed apply closes the session through `close()` and rethrows.
     - `modelFallbackMessage` in its restore form is added to
       `diagnostics` unless a pick overrides the model; the no-models
       form is replaced by the host's line.
     - `configure(sessionId, choice)` runs on the same per-session chain
       as `prompt`. The chain becomes one small helper both use, tested
       over a stub in `turnControl.test.ts`: a change sent before a
       prompt reaches the session first, and a refused change does not
       block the next prompt. `SessionRegistry` itself is covered by the
       gate's real turn for the new-session path, and by the route for
       the resumed and configure paths.
   - **`server.ts` and `transcript.ts`**: `server.ts` answers
     `defaults` with the list through one `journeyDefaults(cwd)` in
     `modelChoice.ts`, whose test proves it leaves temp settings files
     byte-identical; `transcript.ts` answers `resumes` with the read.
     `server.ts` routes `session.configure` and maps
     `ModelNotAvailableError`.
   - **`scripts/turn.ts`**: gains `--model <provider/id>` and
     `--thinking <level>`, passed on `session.open` and printed from its
     answer, and prints the session file's last `model_change` and
     `thinking_level_change` after the turn, so the gate's real turn
     proves the open-with-choice path against Pi and that the file
     records it.

3. **The fake host** (D12): `defaults` per Journey in the world; `model`
   and `thinkingLevel` on a scripted session; the choice at open;
   `session.configure`; scripted open `diagnostics`; the disk recording
   both; the violation for an unlisted level; `failures` for
   `session.configure`. Tests in `fakeHost.test.ts`. `worlds.ts`: `model`
   gains its levels, and two invented models join it, one with levels low
   to max (no `off`) and one without reasoning. `thinkingLevels` also
   reaches the model literals in `connect.test.ts`, `client.test.ts` and
   the protocol tests.

4. **The UI's data** (D2, D5–D8, D11).
   - **The host store** keeps the models; `connect.ts` passes them;
     `signedIn(client)` reads them again.
   - **`conversations/headerChoice.ts`**, pure, beside `liveTurn.ts`:
     - `shownChoice(conversation, models)` gives what the header shows
       and from which source;
     - `pickModel` and `pickLevel` give the next pick, with the shared
       clamp, and say when the level moved;
     - tests in `headerChoice.test.ts` cover each source of the shown
       value, each pick, and the moved level.
   - **The store**:
     - `defaults` is kept on the sessions list, across `loading`, and
       `resumes` from the read, cleared with what is shown; both written
       only by the latest look.
     - `pick` is dropped by `showing()`.
     - `startNewSession` reads the list again.
     - `send()` carries the pick on `session.open` and clears it on the
       answer; a refused open keeps it.
     - `chooseModel(client, journeyId, model)` and
       `chooseThinking(client, journeyId, level)` change the pick, or
       send `session.configure` for the open session, by session id;
       they refuse while the conversation opens or a configure is in
       flight (`configuring`). They reject on refusal, so the header can
       say why, and say nothing on `connection_lost`.
     - The open `Session` keeps a `ModelRef`.
     - Tests in `store.test.ts` against the stub connection. Among them:
       a pick dropped by a look; a send carrying it and the answer
       replacing it; a refused open keeping it; a configure answered
       with a clamped level; a refused configure leaving the session's
       values; a configure while running; two quick picks, the second
       refused while the first is in flight; a configure's answer after
       a look landing on the session, not on what is shown; a stale
       `resumes` not written.

5. **The header** (D2, D7, D8, D10). `useListbox` is extracted from
   `SessionsList.tsx` in its own commit, `SessionsList.test.tsx` green and
   unchanged. `ModelControl.tsx` and `ThinkingControl.tsx` sit in
   `Conversation.tsx`'s header as the right-anchored pair, out of the
   path's `<p>`; the status line for a moved level; `useEscapeToStop.ts`'s
   comment is updated. UI tests in a new `shell/ModelAndThinking.test.tsx`
   against the fake host:
   - the header before any send, for a file with its own model and for a
     new session with the defaults, and the placeholders while the first
     read is pending;
   - a pick before the first send, drawn as held, and the `session.open`
     it carries, with no request before the send;
   - a pick dropped by a look;
   - a pick on the open session, the controls busy, and the
     `session.configure` it sends;
   - a level moved by a model change, with its status line;
   - the thinking list showing only the model's levels, with Pi's
     descriptions and the default tag;
   - "no thinking" for a model without reasoning;
   - "Pi's default" with the thinking control inert;
   - a refused open with its copy and the pick kept, and a refused
     configure;
   - Pi's fallback line from scripted diagnostics;
   - Escape with a list open during a held turn closing the list and
     leaving the turn running, with the hint at the foot;
   - the lists while the session opens, options disabled with the line.

   `Conversation.test.tsx`'s first test, which asserts the model is absent
   before the send, is rewritten to what the header now shows; the rest of
   it stays green unchanged. The tokens net holds the new classes.

6. **Docs.**
   - AGENTS.md: the protocol's new request in the fake-host bullet, and
     `defaults`, `resumes`, scripted diagnostics and the model on the
     disk.
   - The headers of `sessions.ts`, `fakeHost.ts`, `fakeDisk.ts`,
     `conversations/store.ts` and `Conversation.tsx`.
   - At Done:
     - a decision `D18` in `decisions.md`: a session's model and level are
       chosen as Pi's `/model` and `/thinking` choose them, session-only,
       recorded in the file, the level kept across a model change, the
       default read from Pi's settings and never written;
     - this story's index, and the CV1.DS2 candidate table;
     - the worklog.

## Non-Goals

- Setting Pi's default model or level from the app (R3). Terminal Pi
  stays where the default is changed, and the header shows the change at
  the next look. Named as the first ask of daily use.
- Scoped models (`enabledModels`, `--models`) and the cycling keys
  (Ctrl+P, Shift+Tab, `app.thinking.cycle`). The Navigator has no scope,
  and the lists are the mouse's and the keyboard's way in.
- Pi's per-model thinking settings applied when the model changes (D7,
  R1).
- Showing live a model or level that an extension (`pi.setModel`) or a
  virtual model's routing (`routedModel`) sets. Pi emits no model event to
  forward. The header shows what the host last answered, and the next open
  or read shows the file. Virtual models are consciously excluded: none on
  the Navigator's machine, and only an extension registers one.
- A mark in the transcript where the model changed: `transcript.ts` drops
  `model_change`, so after a switch nothing says which answers came from
  which model. The second ask of daily use.
- The model of each session in the sessions list: it needs every file's
  model at list time, which the head-only list read (decisions.md D7, as
  built in US1) does not reach.
- ~~A search or type-ahead in the model list.~~ Ruled in at validation
  (see As Built): the app's host offers 426 models, not twenty-five.
- A persistent mark on a changed control while the run continues: the
  list's foot line and the answer-driven header say what is true.
- Refreshing provider catalogs (terminal Pi's `/model` refresh), signing
  out, and anything else in sign-in.
- Hiding thinking in the transcript (`hideThinkingBlock`).
- A model the open session runs on that has since lost its credential:
  the next prompt is refused in the host's words (US2), and picking
  another model is the way out. A look at a file whose model is gone shows
  the default with no cue; the open's diagnostics line covers the send.
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
And the model list marks anthropic/claude-test "default", and the thinking list shows only claude-test's levels, each with Pi's description, medium marked current and default

Given a new session shown in Garden
When the person picks anthropic/claude-deep, then thinking low, and sends "Hello"
Then before the send no request was made for the pick and both read as held; the host receives session.open with journey garden, model anthropic/claude-deep and thinkingLevel low, then the prompt
And the header shows what the open answered

Given a new session shown with thinking off on anthropic/claude-test
When the person picks anthropic/claude-deep, whose levels are low to max
Then the header shows "thinking low" without a request, and a status line says claude-deep has no off and thinking is now low

Given a pick made for a new session that was never sent
When the person shows an older session, then "New session" again
Then the older session shows its own model and level, and the new session the defaults again

Given Garden's open session shown, idle
When the person picks anthropic/claude-deep
Then both controls are busy until the host answers session.configure with that model and the shown level, the header then shows the answer, and the next session.prompt follows it
And a session read back from the fake host's disk shows the model and level it was left on

Given Garden's open session answering a held turn
When the person picks thinking high, then opens the model list and presses Escape
Then session.configure is sent while the turn runs, the list's foot says Pi takes it at its next request, the list closes on Escape, and the turn is still running

Given a model the host answers model_not_available for
When it is picked for the open session
Then the toast says the host's words once and the header keeps the session's values
And when it is the pick of a send that opens the session, the message is back in the draft, the pick is kept and marked, and the conversation says the session could not open, with the host's words and "Pick another model, then send again."

Given a resumed file whose model Pi cannot use, and no pick
When the send opens it
Then the transcript shows Pi's "Could not restore model" line where the session begins, and the header shows the model the open answered

Given the session's model has no reasoning
When the header is drawn
Then it shows "no thinking" as boxed text, with no list

Given a Journey whose first read is pending
When the header is drawn
Then both controls are dim placeholders, disabled, until the read answers

Given a session opening
When a list is opened
Then it shows the value with its options disabled and says the session is opening
```

## Validation Route

Automated, from the repository root: the gate (`npm run typecheck`,
`npm test`, `npm run build`, `git diff --check`) and the story's tests as
[test-guide.md](test-guide.md) lists them. The host changes how it drives
Pi, since it opens a session on a choice and changes a model on an open
session. So the gate includes one real turn on a Journey the Navigator
names, with a choice:
`npm run turn --workspace packages/host -- --journey <slug> --model anthropic/claude-haiku-4-5 --thinking low --prompt "Reply with the single word: pong"`.
It must answer, print the open's model and level as asked, and print the
file's last `model_change` and `thinking_level_change` as the same. The
slice that declares `pi-ai` also runs `npm run bundle` and launches the
built app once. `cargo check` is not in the gate: the shell does not
change.

Navigator, in the window (`npm run dev`), on a Journey the Navigator names
(the automation Journey served US1 and US2), with a terminal open in that
Journey's project path. Before step 1, copy both settings files:
`cp ~/.pi/agent/settings.json /tmp/global-before.json; cp .pi/settings.json /tmp/project-before.json 2>/dev/null`.
A file's witness is its last entries, read without resuming it:
`grep -E '"type":"(model_change|thinking_level_change)"' <file> | tail -3`,
with the file's path taken from the sessions list's `pi -r` listing, or
from `ls -t ~/.pi/agent/sessions/<project folder>/ | head -1`. Terminal Pi
resumes nothing until step 11, when the app is quit.

| Step | Do | Expected observation |
|---|---|---|
| 1 | Pick the Journey; read the most recent file's witness | Before any send, the header shows a model as `provider/id` and `thinking <level>`, boxed as controls, and the file's last entries name the same |
| 2 | Pick "New session"; then resize the window to its minimum width | The header shows `anthropic/claude-sonnet-5-5` and `thinking medium`, the defaults in the copied settings; at 860 the two controls stay whole at the right, the path truncates with an ellipsis, the Journey's name is visible, and a list opened there is not clipped |
| 3 | Open the thinking list; press Escape | It lists low, medium, high, xhigh and max, each with Pi's description, medium marked current and default; no off, no minimal; Escape closes it |
| 4 | Open the model list; type "haiku" in its filter and pick `claude-haiku-4-5`; open the thinking list; pick low | The model list opens with the focus in its filter, shows the models with their providers and `claude-sonnet-5-5` marked default, and narrows as you type; the header shows `anthropic/claude-haiku-4-5` and `thinking medium`, then `thinking low`, both in ink as held, and the list's foot said it takes effect with the first message; the thinking list lists off, minimal, low, medium, high; no new file exists in the sessions folder |
| 5 | Send "Which model are you, in one line?"; when it settles, read the new file's witness | The answer streams; the header still reads haiku and low, now muted; the file's last entries are haiku and low |
| 6 | Pick "New session"; pick `openai-codex/gpt-6-luna`, then thinking off; send "Which model are you, in one line?"; read the new file's witness | The header shows the GPT model, then `thinking off`, held; the answer comes from it; the file's last entries are gpt-6-luna and off |
| 7 | On that open session, pick `anthropic/claude-sonnet-5-5` | Both controls busy for a moment; the header then shows sonnet and `thinking low`, and the status line says sonnet-5-5 has no off and thinking is now low; the witness shows `model_change` sonnet, then `thinking_level_change` low (an interim `medium` before it is Pi's switch rule and is expected) |
| 8 | Send a prompt that takes several tool calls ("List the top-level folders of this project one at a time, with a sentence on each, using one tool call per folder"); while it runs, pick thinking high, then pick `claude-opus-5-5`; open the model list and press Escape; when it settles, read the file | The turn runs on uninterrupted; the list's foot said Pi takes it at its next request; the header shows each change when the host answers; Escape closes the list and the turn goes on; the file shows the entries, and the assistant messages after them name `claude-opus-5-5` |
| 9 | Open the sessions list and show the haiku session from step 5; pick `claude-sonnet-5-5` and thinking high; send "And now?"; read its witness | Before the pick the header shows haiku and low, read from its file; after it, sonnet and high held; the answer comes from sonnet; the file ends on sonnet and high |
| 10 | Quit the app, relaunch, pick the Journey | The header shows the most recent session's model and level as the file ends |
| 11 | In the terminal, `pi -r` and pick that session; quit without sending; then `diff /tmp/global-before.json ~/.pi/agent/settings.json; diff /tmp/project-before.json .pi/settings.json 2>/dev/null` | The footer shows `(anthropic) claude-sonnet-5-5 • high`; both diffs are empty, or show only keys terminal Pi wrote itself, such as `lastChangelogVersion` |

**Pass:** every observation holds. **Fail:** any does not, or one of
these happens:

- the header shows a model or level other than the one the next answer
  runs on, once the host has answered;
- a pick made before a send opens or writes anything;
- a change on the open session is missing from the file's entries;
- a change during a run stops, fails or restarts the turn;
- Escape with a list open stops a turn;
- a model or thinking key in Pi's settings changes.

Consciously left out of the window, and proven against the fake host and
the stubs only:

- a model Pi refuses, at open or on the open session, since that needs a
  provider signed out mid-session;
- Pi's settings naming no usable default, a file whose model Pi cannot
  restore, and Pi's fallback line;
- a model without reasoning, since all 25 of the Navigator's models
  reason;
- the order of a change and a prompt sent at once (D6), which the stub
  stages and a hand cannot;
- a cross-provider model change during a run, allowed as terminal Pi
  allows it.

E2E decision: required. The fake host proves every path in the UI and the
stubs prove the host's rules. Only the window with Pi proves four things:

- Pi answers on the chosen model at the chosen level;
- the file records the choice, so `pi -r` resumes on it;
- a change made during a run reaches Pi's next request and leaves the run
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
     under the server's exhaustive switch; the model literals in
     `worlds.ts`, `connect.test.ts`, `client.test.ts` and the protocol
     tests gain `thinkingLevels` here; this slice declares `pi-ai` and
     runs the bundle once;
  2. the `useListbox` extraction, alone and behavior-neutral, under
     `SessionsList.test.tsx`;
  3. the UI's data and the store;
  4. the two controls and the header, with the UI tests;
  5. the docs and comments.
- A real turn runs only on the Journey the Navigator names, at
  validation.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- In a real run or in the parity test, the open answers a different model
  or level than the header showed for a new session or a resumed file.
  The host's reproduction of Pi's start rule (D3, D4) has drifted from
  Pi 1.4.0; stop and re-read `sdk.js` before patching either side.
- A change made during a run does not reach Pi's next request, or makes
  the run fail (checked at validation step 8). R2 is then revisited toward
  the thinking control only, or both controls disabled while a turn runs.
- Scanning the branch on a read measurably slows the largest known
  session's read (175 ms today, US1).
- The listbox extraction cannot keep `SessionsList.test.tsx` green
  unchanged.
- The right-anchored pair (R5, A) hides the Journey's name or clips a
  list at 860 with the longest model id (checked at validation step 2).
  The layout is then rechosen with the Navigator among R5's options.
- The parity test cannot run hermetically: it is dropped, said in the
  test guide, and the drift stop condition above is the only net.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval; R1–R5 are
  ruled, each the recommended option, with the options and the reasoning
  in [plan-review.md](plan-review.md#navigator-rulings):
  - **R1 (D7):** a model change keeps the level, clamped.
  - **R2 (D8):** a change during a run is allowed, on both controls.
  - **R3 (D9):** the app never writes Pi's settings.
  - **R4 (D14):** `pi-ai` 1.4.0 is declared in the host.
  - **R5 (the header at 860):** one row, the two controls a
    right-anchored pair, the path giving way first.

## As Built

Where the implementation departed from the plan above, and why. The
decisions stand; these are the facts that refined them.

- **Slices.** As planned: the protocol, the host's rules and wiring, and
  the fake host together (`ae2beb0`), the bundle staged and the built app
  started in that slice; the listbox extraction alone, the sessions list's
  tests unchanged (`cfcbb43`); the UI's data and the store (`31cc8fd`); the
  two controls and the header (`e79b416`); these docs.
- **The parity test runs.** Pi's own `createAgentSession` resolves every
  case of the start rule over a temp agent dir, with Pi's bundled catalog
  and a runtime key Pi never sends, no network and nothing written to the
  person's `~/.pi`, in about 100 ms. Its cases are the ones D3 and D4 name;
  the clamp is pinned to `pi-ai`'s over all 1,599 models Pi knows.
- **One host function for both reads (D3, D4).** `journeyStart(cwd,
  catalog, branch?)` answers a new session's `defaults` and a file's
  `resumes`, from the settings as the open reads them; "a file with no
  messages" is read as Pi reads it, by whether any entry on the branch puts
  a message in Pi's context (`sessionEntryToContextMessages`).
- **The fake host says Pi's fallback line itself (D12).** Instead of a
  world scripting an open's diagnostics, the fake host keeps the real
  host's rule: a resumed file whose model the world does not list falls
  back to the default model and the open says Pi's "Could not restore
  model" line, unless a pick was made over it. One less thing a test can
  script wrong.
- **A pick that says only what is shown is no pick.** Picking, before the
  first send, the model and level the session would start on anyway holds
  nothing, so the header does not mark as held what is not, and the open
  carries nothing; on the open session such a pick sends nothing. A
  refused open's mark therefore clears when the person picks their way
  back to the default.
- **"New session" reads nothing more (D3).** The sessions list reads
  itself again each time it opens, and New session is picked from it, so
  the defaults are as fresh as the list at that moment; a second read on
  the pick would only repeat it.
- **A moved level is said by a toast (D7).** Sonner's toast is a polite
  live region, and it is where the composer already says its one-off
  lines (a message Pi ran as a command); a new status line in a one-row
  header had no place to stand.
- **The model's name is cut from its start (D10, R5).** One text,
  right to left outside and isolated left to right inside (`<bdi>`), so
  the ellipsis lands at the start: the provider gives way first, then the
  start of the id, and the end that tells models apart stays. It replaces
  a width threshold for the provider, and keeps the name one text, which
  the sessions list's unchanged tests read. The model's control yields
  only after the path and the session's title (`shrink-[0.1]`); the
  thinking control and the Journey's name never.
- **Names.** The held pick's type is `ModelPick` (`Pick` would shadow
  TypeScript's own); the UI's pure rules are `headerChoice.ts`; the lists'
  shared popover is `HeaderList.tsx`, and a fact standing in a control's
  box is `HeaderFact`.
- **The thinking list's default** is the Journey's default level, which is
  Pi's global default unless the settings give the default model a level
  of its own.
- **A filter in the model list, ruled in at validation (option a).** The
  real host offers 426 models where the plan read 25 from Pi standalone:
  it loads Mirror's configuration, whose `OPENROUTER_API_KEY` signs
  OpenRouter in with 401. The plan had ruled out a search on the strength
  of twenty-five rows; the Navigator ruled one in. The model list opens
  with the focus in a filter field above its options, as Pi's `/model`
  opens on its search line: every word typed must appear in a model's
  `provider/id` or name, case aside (`filterModels`, pure, in
  `headerChoice.ts`); the arrows, Enter, Escape and Tab stay the list's,
  so Escape still closes it without stopping a turn; a query that matches
  nothing says so. The field is a combobox over the listbox
  (`useListbox` gains `field` and `onFieldKeyDown`; the sessions list,
  which has no field, is unchanged).
