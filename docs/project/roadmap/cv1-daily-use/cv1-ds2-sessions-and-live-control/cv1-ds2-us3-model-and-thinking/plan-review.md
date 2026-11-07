[< Story](index.md)

# Plan Review — CV1.DS2.US3

**Date:** 2026-11-07
**Reviewed:** the first version of the plan, the story and the test guide, as committed at the Plan checkpoint in `9422d1a`.
**Outcome:** the plan was revised with the twenty-six defects below and the Navigator's rulings on R1–R5, each the recommended option; the current version is [plan.md](plan.md), approved on 2026-11-07.

## How it was reviewed

Five lenses were chosen for what this plan puts at risk:

- **engineer**, for the host's new seam (`modelChoice.ts`, `applyChoice`,
  the per-session chain shared by prompts and changes, how a new and a
  resumed session take a choice), the protocol's shape, the store's state
  model, the listbox extraction, and the `pi-ai` dependency;
- **quality-assurance**, for whether each scenario is provable the way the
  plan says, the fake host's faithfulness, the races a change and a prompt
  open, the route's witnesses, the real turn in the gate, and which tests
  change;
- **ai-engineer**, for Pi 1.4.0's model-in-the-loop semantics: how a new
  and a resumed session resolve their model and level, what `setModel`
  and `setThinkingLevel` do, where a running loop takes a change, the
  clamp, the fallback message, and what Mirror makes of a change;
- **product-designer**, for the flow: a choice held until the first send,
  dropped on a look, the two controls in the header, the level moving
  when the model changes, a change during a run, refusals, and what daily
  use will ask for first;
- **experience-designer**, for how the header reads with two more
  controls at the window's minimum width, how a control is told from a
  label, the two lists, the hint during a run, and the in-flight moment.

Security-engineer was left out: nothing new crosses the socket but a
model reference and a level, both checked against lists the host owns,
and the one path Pi's words could carry (the fallback message) is a
finding below. Database-architect and devops-engineer were left out: no
schema is touched and nothing in the runtime's operation changes.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror as the system prompt; `claude-sonnet-5-5` at thinking `high`;
no tools, no session, no extensions, no skills, no context files, nothing
logged to Mirror). Each saw the plan, the story, the test guide, the
Delivery Story, the repository rules, the development guide's lifecycle
and verification sections, D7, D14 and D17, the debt ledger, US1's As
Built, the code the story touches (protocol, host server, sessions, auth,
turn control, transcript, the turn script, host store and connect,
conversations store and live turn, Conversation, SessionsList, Composer,
the Escape hook, Shell, SignInPanel, the tokens), the test harness (fake
host, fake disk, worlds, the sessions list and conversation tests), the
window's size, and the relevant source of Pi 1.4.0 (`createAgentSession`,
`AgentSession`'s model and thinking management and next-turn refresh,
`findInitialModel`, `getBranchSelection`, the defaults, the auth guidance,
the settings and session managers' types, `pi-ai`'s thinking levels, the
agent loop, the interactive mode's `/model` and `/thinking`, the thinking
selector, the RPC mode, the footer), and the Navigator's own settings and
available models.

The Driver then verified the sharpest claims:

- **`setModel` applies Pi's switch rule to the level before anything the
  host does.** `agent-session.js`: `setModel` computes
  `_getThinkingLevelForModelSwitch(model)` (the per-model setting, else
  the global default, else the current level), sets `agent.state.model`,
  appends the `model_change`, calls `setThinkingLevel` on that level, and
  only then awaits `_emitModelSelect`. With the Navigator's settings
  every model change resets the level to `medium` inside `setModel`. The
  plan's `applyChoice`, which skipped the level when it equaled the
  session's, would have left a session on `medium` while the header said
  `high`. Four reviewers found it; the plan's headline rule (D7) was
  unimplemented as written.
- **`buildSessionContext()` cannot say whether a file records a level.**
  `session-manager.js`, `getSessionContextSettings`: `thinkingLevel`
  starts at `"off"` and is overwritten by each `thinking_level_change`;
  `model` is the last `model_change` or the last assistant message's
  provider and model, whichever comes later on the path. Pi's resume
  decides "the file records a level" by scanning the branch for a
  `thinking_level_change` entry (`sdk.js`, `hasThinkingEntry`), and a file
  with messages but no entry takes the global default with no per-model
  lookup. `getBranchSelection` is not exported from the package's index.
- **Pi's fallback message carries paths in one form.** `sdk.js` sets
  `modelFallbackMessage` to `"Could not restore model p/id"` plus
  `". Using p/id"`, path-free, when a fallback model is found, but
  overwrites it with `formatNoModelsAvailableMessage()` when none is,
  and that embeds `getProviderLoginHelp()`, which joins `getDocsPath()`
  into two lines. The plan's "Pi's words carry no path" was wrong for
  that form.
- **`pi-ai` exports the two level functions from its root**
  (`index.js`: `export * from "./models.js"`), and
  `pi-coding-agent` does not re-export them. `EXTENDED_THINKING_LEVELS`,
  the canonical order the clamp walks, is a module constant, not
  exported: the UI's own clamp would have had to invent the order.
- **`SettingsManager.create` reads only.** The settings storage writes
  only through its update path (`writeFileSync` under `fn(current)`), and
  `fromStorageWithPaths` loads. A list read that builds a settings
  manager touches no file.
- **Mirror's logger never reads the model.** `mirror-logger.ts` has no
  `model_select`, `thinking_level_select`, `ctx.model` or usage read; a
  change is nothing to Mirror, as the plan said, now shown.
- **Virtual models come only from extensions** (`registerVirtualModel`
  in the extension loader), and the Navigator's twenty-five models are
  all physical; a conscious exclusion, named.
- **Terminal Pi's Ctrl+P and Shift+Tab have no streaming guard** in the
  interactive mode's action bindings or in `AgentSession.cycleModel` and
  `cycleThinkingLevel`; a change during a run is what the terminal
  allows.
- **The header overflows at the default window, not only at 860.** The
  sidebar is `w-72` (288px); at 860 the main column holds about 530px
  inside the header's padding, and `anthropic/claude-sonnet-5-5` plus
  `thinking medium` as padded controls take about 330px before the name,
  the sessions button and the path. The `<p … truncate>` that holds the
  path, model and level today clips its flex children without an
  ellipsis, so the level would be the first thing to vanish. The stop
  condition the plan set would have fired on the first run; the layout
  is a decision, now R5.
- **The route contradicted itself.** Steps 6 to 8 changed the model and
  level of the session step 5 opened, so step 9's "show the haiku
  session from step 5 … read from its file" named the open session,
  whose file by then ended on sonnet at `high`. And `pi -r` on a session
  the app holds open runs Mirror's `session_start` and `session_shutdown`
  against the same file (TD-005); the file itself, read with `grep`, is
  the honest witness.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision.

| Decision | Options | Recommendation, ruled |
|---|---|---|
| R1 — the level when the model changes (D7; all five lenses) | (a) kept, clamped to what the new model supports; (b) Pi's switch rule: the per-model setting, else the global default | **(a)**: the two controls are independent on screen, and with the Navigator's settings (b) resets the level to `medium` on every model change, which beside a thinking control reads as a fault. It departs from `/model` parity, and the file records Pi's interim level entry before the kept one (defect 1); the Navigator should know both |
| R2 — a change while a turn runs (D8; ai-engineer R2, quality-assurance R1, product-designer R2) | (a) both controls stay live and Pi takes the change at its next request in the run; (b) the thinking control only, the model control disabled while a turn runs; (c) both disabled, as the sessions list | **(a)**: deepening a long run is the real use, it is what terminal Pi's keys allow mid-stream, and the agent loop takes `agent.state.model` and `thinkingLevel` before every request after the first, verified. Route step 8 now changes the model too, within the provider, and the stop condition revisits toward (b) if Pi fails on it. A cross-provider change mid-run is allowed and consciously left out of the route |
| R3 — Pi's settings (D9; product-designer R5) | (a) never written; (b) a "set as default" that writes `settings.json` as Pi's selectors do on their save key | **(a)**: terminal Pi stays where the default is changed. The product-designer names the cost: every new session opens on the default, and re-picking is the first thing daily use will ask for; revisit after the week of use |
| R4 — `pi-ai` as a host dependency (D14) | (a) declare `@earendil-works/pi-ai` 1.4.0 for `getSupportedThinkingLevels`; (b) reimplement it | **(a)**: the function `AgentSession` itself calls, exported from the package's root, verified; already installed at the version `pi-coding-agent` pins. Staging installs from the host's dependencies, so the bundle gate runs once (defect 24) |
| R5 — the header at 860 (experience-designer R1, product-designer R3) | (A) one row: the two controls a right-anchored cluster that never clips, the path giving way first with its own ellipsis, then the sessions title to a minimum of about 12rem, then the provider prefix, the model id last; (B) two rows below a width; (C) the two controls on a strip by the composer, where Pi's footer carries them, and the story's "from the conversation's header" rewritten | **(A)**: it keeps one calm line in Pi's register and the story's words; take (C) only if (A) feels cramped in the window at 860, which the route now checks |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. **A pick always carries the pair, and the level is set after the
   model.** The UI sends the model and the shown level together on
   `session.open` and on `session.configure`; `applyChoice` calls
   `setModel`, then `setThinkingLevel` with the wanted level
   unconditionally (Pi records only a change). The interim entry Pi's
   switch rule writes, and the window between it and the host's level
   while `setModel` awaits its extension event, are named as accepted;
   the stub's `setModel` models the switch rule so the test can fail
   (engineer 1; quality-assurance 1; ai-engineer 2; product-designer 1).
2. **The UI sends only a level in the model's list.** The clamp runs
   before any request, the fake host's violation for an unlisted level
   stays, and Pi's clamp on the host is a backstop tested over the stub
   (engineer 2; quality-assurance 2).
3. **One clamp, in the protocol package.** `THINKING_LEVELS`, Pi's
   canonical order, and `clampLevel(level, supported)` live in
   `packages/protocol`, used by the host and the UI; a host test pins
   `clampLevel` to `pi-ai`'s `clampThinkingLevel` over every available
   model and every level. The host uses `pi-ai` for
   `getSupportedThinkingLevels` only (engineer 10, R-A; ai-engineer 9;
   quality-assurance 10).
4. **The read follows Pi's resume rule from the branch.** The host scans
   `getBranch()`: the model is the last `model_change` or the last
   assistant message, whichever is later; the level is recorded when a
   `thinking_level_change` is on the branch, else the global default
   with no per-model lookup; a file with no messages takes the
   new-session rule (engineer 3; quality-assurance 9; ai-engineer 3, 4).
5. **Only Pi's restore-failure form reaches the transcript.** The host
   adds `modelFallbackMessage` to `diagnostics` only in its "Could not
   restore model" form; the no-models form is replaced by the host's own
   line; and no fallback line is added when a pick overrides the model
   (engineer 11; quality-assurance 9; ai-engineer 5; product-designer 8).
6. **A refusal is one check, and a failed apply cleans up.**
   `usableModel` uses the prompt path's check (`hasConfiguredAuth`, else
   `checkAuth`), `applyChoice` wraps `setModel`'s throw into
   `ModelNotAvailableError`, and an open whose apply fails closes the
   session it registered through `close()`, so Mirror closes the
   conversation it opened (engineer 4; quality-assurance 11; ai-engineer
   7; product-designer 7, 13).
7. **The header waits for the answer.** While a `session.configure` is
   in flight both controls are busy (the `Pulse` glyph, `aria-busy`,
   picks ignored) and the header keeps the session's values; "at once"
   becomes "when the host answers" in D8, the story and the route; a
   store test sends two quick picks (engineer 6, R-B; quality-assurance
   2; experience-designer 4).
8. **Readiness latches.** A re-read of `models.available` replaces the
   list and never demotes `canUseModels`; a failed re-read keeps the old
   list; `signedIn(client)` reads the list and keeps readiness if the
   read fails (engineer 5).
9. **Defaults survive and refresh.** The store keeps `defaults` across
   the list's `loading`; `startNewSession` reads the list again; a
   Journey whose list cannot be read shows the controls as placeholders
   and sends on Pi's default, the open's answer then naming it; a host
   test proves a list read leaves the settings files untouched
   (engineer 9; product-designer 10).
10. **Names.** The answer shape is `ModelAndLevel { model?, thinkingLevel }`
    on `defaults`, `resumes` and the configure result; the open and
    configure requests carry their two optional fields inline; the
    store's held choice is `pick`; the host module is `modelChoice.ts`,
    the UI's `headerChoice.ts` (engineer 12, 14).
11. **The header's layout is settled (R5) and the controls leave the
    `<p>`.** The model and thinking controls are a right-anchored
    `shrink-0` pair with a tight gap, boxed like the sessions button
    (padding, hover, focus ring, chevron) so that a box means a control
    and the unboxed path means a label; accessible names "Model: …" and
    "Thinking: …"; the two popovers open right-aligned, the thinking
    list narrower (experience-designer 1, 2, 7; product-designer 9).
12. **A level that moves is said.** When a model pick changes the level,
    before the first send or in the configure's answer, one `role="status"`
    line in the composer's register says so: "claude-sonnet-5-5 has no
    off; thinking is now low." (experience-designer 3; product-designer
    4).
13. **A held pick is marked.** An unsent pick renders in `text-ink`
    rather than `text-muted`, and the open list ends with a dim line,
    "Takes effect with your first message."; a look drops it without a
    line, since the header is then truthful (experience-designer 5;
    product-designer 6, R4).
14. **A refused open says the right remedy.** The conversation's failure
    keeps its code; for `model_not_available` the last line reads "Pick
    another model, then send again.", the held pick is kept so the header
    says what a retry would run on, and the model control carries the
    `danger` token until the pick changes (experience-designer 6;
    product-designer 7).
15. **The controls are always drawn.** A dim `…` placeholder, disabled,
    while the first read is pending or failed, as `Sessions…` is; the
    model control reads "Pi's default" when no usable default is known
    and the thinking control is then an inert placeholder until a model
    is picked; while the session opens the lists open to show the value
    with their options disabled and one line, "Opening the session…", as
    the sessions list does while working (product-designer 5, 12;
    experience-designer 11, 12; engineer 8; ai-engineer 4).
16. **"no thinking"** for a model whose only level is `off`: boxed like
    the control, no chevron, no hover, with a title "This model does not
    reason." (product-designer 14; experience-designer 8).
17. **The lists' marks.** The current item is bold with `aria-selected`,
    as the sessions list; `default` is a quiet `text-meta` suffix in both
    lists, the thinking list tagging Pi's default level as Pi's own
    selector does; a model row is the id, truncating, with the provider
    in meta; each list opens scrolled to the current row; the running
    hint sits at the foot in meta, not a live region, and reads "Pi
    takes it at its next request in this run, or at your next message."
    (experience-designer 9, 10; product-designer 3, 11; ai-engineer 6).
18. **Store guards.** `chooseModel` and `chooseThinking` refuse while the
    conversation opens or a configure is in flight; a configure's answer
    writes to the session by id, not to what is shown; `resumes` and
    `defaults` from a read are written only by the latest look; two
    configures answer in order (quality-assurance 12).
19. **Tests that change, named.** `Conversation.test.tsx`'s first test,
    which asserts the model is absent before the send, is rewritten to
    what the header now shows; `connect.test.ts` for `hostReady`,
    `signedIn` and the model literals; `worlds.ts`; the store tests' stub;
    the protocol tests. `SessionsList.test.tsx` and the rest of
    `Conversation.test.tsx` stay green unchanged (quality-assurance 5;
    engineer 15).
20. **A parity test against Pi.** A hermetic host test over a temp agent
    dir compares `startingChoice` with what `createAgentSession` resolves
    for a new session in every branch of the rule, run at every Pi bump;
    if Pi cannot be driven without network there, the test is dropped and
    the stop condition stands (ai-engineer 1; quality-assurance 10).
21. **The route is coherent and its witnesses are files.** Step 6 starts
    a new session so step 5's file keeps haiku at low; a new step shows
    that older, non-open file, picks another model and level, and sends,
    the resumed path with a choice; each file is witnessed by its last
    `model_change` and `thinking_level_change` read with `grep`, never by
    `pi -r` on a session the app holds open; step 8 also changes the model
    within the provider and the file shows the assistant messages after
    the entry on the new model; `pi -r` once at the end, after quitting,
    with the `(anthropic)` prefix Pi's footer adds when more than one
    provider is available; both settings files copied before step 1 and
    diffed at the end; a step at 860 width (quality-assurance 3, 6, 7, 14,
    15; product-designer 2, 3; ai-engineer 6).
22. **The turn script reads the file back.** `turn.ts` prints the
    session file's last `model_change` and `thinking_level_change` after
    the turn, so the gate's real turn proves the choice was recorded; the
    plan says what the real turn covers and no more (quality-assurance 4).
23. **Slice 1 names its fixtures.** `thinkingLevels` on `AvailableModel`
    reaches `worlds.ts`, `connect.test.ts`, `client.test.ts` and the
    protocol tests (engineer 15).
24. **The bundle is in the gate once.** `stage-host.mjs` installs the
    host's declared dependencies into the staging directory, so declaring
    `pi-ai` changes what it installs; `npm run bundle` and a launch run in
    the slice that declares it (quality-assurance 13; engineer 10).
25. **Named exclusions and facts.** Virtual models are excluded
    consciously (none on the Navigator's machine; extension-registered
    only); Mirror's logger reading no model is recorded as verified; the
    Non-Goals name the first asks of daily use: the default from the app
    (R3), a model-change mark in the transcript, each session's model in
    the list, type-ahead in the model list (ai-engineer 8, 10;
    product-designer 15).
26. **Plan hygiene.** The repository's decisions are cited as
    "decisions.md D14" where the plan's own D14 would be read instead;
    the settings-write witness in the route is a diff of both files, not
    three greps (engineer 15; quality-assurance 14; ai-engineer 11).

**Not taken:**

- A persistent "from the next request" mark on a changed control while
  the run continues (product-designer 3): state for a window Pi's own
  footer does not mark; the foot line in the list and the answer-driven
  header say what is true.
- Dropping the refused model from the held pick so a retry works
  (product-designer 7): the header would change under the person; the
  copy tells them to pick (defect 14).
- A `fellBack` flag on `resumes` so a look says the file's model is gone
  (product-designer 8): needs a credential lost since the file was
  written; the open's diagnostics line covers the send.
- A dry run of `createAgentSession` to answer `defaults` instead of
  reproducing the rule (ai-engineer 1): it loads every extension and
  races the Mirror logger's process-wide guard with a real open; the
  parity test (defect 20) catches the drift instead.
- A configure step in `turn.ts` (quality-assurance 4): the window covers
  `configure` with the file as witness; the script stays one turn.
- Type-ahead in the model list (product-designer 11; experience-designer
  9): recorded as a first ask; the list opens scrolled to the current row.
- A cross-provider model change in route step 8 (ai-engineer 6;
  quality-assurance R1): allowed, as terminal Pi allows it, consciously
  left out of the route.
- Pi's per-level editor border color as a second cue (experience-designer
  13): a token pass for another story.

## What holds, in the reviewers' words

Every lens confirmed from the sources that a new session records its
model and level as its first entries and a resumed one takes
`createAgentSession`'s options without recording them, so D5's split is
right; that `setModel` checks the credential, appends the change, emits
`model_select` and writes settings only with `persist`; that
`setThinkingLevel` clamps and records only a change; that
`clampThinkingLevel` takes the nearest level upward, else downward, so
step 7's `off` → `low` on sonnet-5-5 is right; that the agent loop takes
`agent.state.model` and `thinkingLevel` before every request after the
first and the request in flight keeps its own; that `findInitialModel` is
unexported and D3's settings branch matches it; that `accepting` settles
at Pi's preflight, so a change serialized on it waits only for
acceptance; that keeping a level as a string checked against the model's
list is sound; that the Escape-first overlay rule and the listbox
extraction follow the existing pattern; and that the 0.6.0 → 0.7.0 bump
is justified by zod stripping unknown fields.
