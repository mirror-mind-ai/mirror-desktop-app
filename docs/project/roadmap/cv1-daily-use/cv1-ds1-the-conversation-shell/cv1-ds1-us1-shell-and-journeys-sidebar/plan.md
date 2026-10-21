# Plan — CV1.DS1.US1

## Objective

Replace the spike console with the shell a person lives in: a sidebar of
active Journeys grouped by hierarchy beside a conversation area. Picking a
Journey shows it and writes nothing; the first send opens its session in its
project path. Switching Journeys keeps each conversation, its draft and its
background stream, and says which Journey is still working. Every empty and
failure state names what happened and what to do next, in place. The
console's component state becomes Zustand stores with actions, tested as
pure state, that US2 and US3 grow on. Everything is proven against the fake
host from TS1, plus one run of the real app.

This is the second version of the plan, revised after a four-lens review;
see [plan-review.md](plan-review.md). The look — tokens, type, theme, chrome
— was split into [TS2](../cv1-ds1-ts2-mirrors-tokens-and-theme/index.md); US1
runs on the tokens that exist today.

## Decisions taken

From the review, with the Navigator's rulings (D1–D10 in the review):

- **Lazy open (D1).** Select shows; the first send opens. Nothing is written
  to Mirror by looking.
- **First run (D2).** The sidebar is always there; with no usable model the
  area carries the sign-in panel; no session until a model exists.
- **Drafts (D3).** Kept per Journey in the conversations store.
- **No project path (D6).** Selectable, not openable; the area says why and
  how.
- **Host unreachable (D7)** is shell-level with "Try again"; **Journeys
  failed** is sidebar-local with "Try again".
- **Failed open (D8).** The Journey stays current; the failure is in the
  area with the path; sending again retries.
- **Running marker (D9)** on the sidebar item, derived from the
  conversation's state.
- **The hierarchy is computed in the UI from `Journey.parent`**, with the
  core's own rule (`groupJourneysByParent`: a parent absent from the set is
  a root) over the active Journeys, siblings compared as the core compares
  them (lower-cased, code point order), so the sidebar orders as
  `mirror journeys` does. Self-parents and cycles terminate with every
  Journey shown once, at the root. No protocol change.

## Scope

1. **Stores** (`apps/desktop/src/<concern>/store.ts`), Zustand 5, one per
   concern, each defined from one `initialState` with `reset = set(initialState, true)`
   and registered in `stores/resetAllStores()`; a test asserts every store
   module is registered. Actions take the client as an argument and are
   tested with a stub `{ request }` and scripted event lists, no DOM.
   - `host/store.ts`: `status: connecting | connected | ready | failed`
     (`ready` once `models.available` answered; `failed` carries the
     message), the `HostClient`, the identity, whether any model can be used.
     `connectToHost(client)` runs the chain step by step, each step naming
     its failure target: endpoint or `hello` → host `failed`;
     `models.available` → host `failed`; `journeys.list` → journeys
     `failed`. `tryAgain()` re-runs it. The connect effect stays in `App`
     with the `cancelled` guard TS1's red run proves.
   - `journeys/store.ts`: `loading | loaded | failed` with the host error,
     and only what the host listed. `journeys/tree.ts` beside it.
   - `conversations/store.ts`: `current: journeyId | null`, and one entry
     per Journey from the first selection:
     `{ status: "idle" | "opening" | "open" | "failed"; draft; rows; running; session?; failure? }`.
     Actions: `select(journeyId)`; `setDraft(journeyId, text)`;
     `send(client, journeyId)` — opens the session first when the entry is
     not `open`, then prompts; the user row is shown at once and `running`
     rolled back when the prompt fails; `abort(client, journeyId)`;
     `applyHostEvent(event)` routes by `sessionId` to the owning entry: an
     unmatched `sessionId` is dropped, with the reason in a comment;
     `agent_settled` clears `running` on the owner only;
     `session.extension_error` carries a `sessionId` and routes the same
     way. Open-once: a second `send` while `opening` queues nothing and
     sends nothing; concurrent opens in two Journeys keep their own state.
     `conversations/transcript.ts` is the console's `reduceRows`, moved
     unchanged with its test.
   - `shortenHome(path)` in its own module with a unit test naming its
     cases, including a `/Users/*` path that is not home, and a comment
     that the true home would have to come from the host.
   - Selector rule, written in the stores' module comment: select stable
     references and derive with `useMemo`; per-item subscriptions in the
     sidebar item (`s.entries[id]?.running`); the pane selects
     `s.entries[s.current]` only.
2. **The shell** (`apps/desktop/src/shell/`):
   - `Shell.tsx`: sidebar left, area right; the top of each a drag region,
     the sidebar inset for the traffic lights. Host `failed` is shell-level:
     the area carries the statement and a "Try again"; the sidebar shows
     nothing to pick. `showSignIn` is `useState` here.
   - `Sidebar.tsx`: `nav` > nested lists, each item with `aria-level`, the
     current one `aria-current`, a running one `aria-busy` with a visually
     hidden "working" status. A row is one line of the name; a Journey
     without a project path shows a second muted line, "No project path
     yet". States: loading; failed (a heading in the product's voice per
     `HostError.code`, the host's message beneath, "Try again"); empty ("No
     active Journeys", with how to create or reactivate one); listed. Footer:
     "Sign in", and the host's versions behind a quiet "About" affordance.
   - `Conversation.tsx`, keyed by Journey, with the area's states:
     - *selected*: header with the name and `~`-path from the Journey
       record; empty transcript; the composer bound to the entry's draft;
     - *no project path*: the header, the reason and
       `mirror journey set-path <slug> <path>` where the composer would be;
     - *no model*: the sign-in panel where transcript and composer would be;
       on sign-in it yields to the selected Journey; the header never shows
       "model?";
     - *opening*: the user row shown, one muted line "Opening in ~/garden…";
     - *open-failed*: the failure named with the path, draft kept, send
       retries;
     - *open*: the header adds the session's `cwd` (replacing the catalog
       path), model and thinking level; transcript and composer as the
       console had them. Open `diagnostics` render as muted rows.
   - `EmptyConversation.tsx`: one centered muted line, "Pick a Journey",
     only when there is one to pick.
   - Toasts only for failed actions; never for a standing state.
   - `App.tsx` composes them; `main.tsx` unchanged; `renderApp.tsx` calls
     `resetAllStores()` before rendering.
3. **Microcopy requirements** (wording may be refined in implementation,
   the facts must be there): no project path → the reason and the command;
   no active Journeys → how to create or reactivate; Mirror not configured
   → a person-facing heading, the host's words as detail, "Try again"; host
   unreachable → the statement and "Try again"; failed open → what failed
   and the path; empty area → "Pick a Journey".
4. **The console removed.** `App.tsx` is the shell; `reduceRows` and its
   test move; the proof test becomes the shell's end-to-end test (select,
   send, open, stream, settle); the mid-turn leak test moves with it.
5. **The fake host's scripted failures.** One shape on the world:
   `failures?: readonly ({ request: "hello" | "journeys.list"; error: HostError } | { request: "session.open"; journey: string; error: HostError })[]`.
   An answered failure is logged like any answer; one never consumed is
   reported at teardown. A `session.open` can also be `held`, released by
   the test like a turn. `World.journeys` stays a list. Harness tests
   included.
6. **UI tests**, against the fake host:
   - hierarchy: a nested child, an active child of an inactive parent at the
     root, inactive omitted; a pathless parent over a pathed child, the
     child at level 2 and openable;
   - picking shows name, path, composer, `aria-current`, and sends no
     `session.open`; a double click still sends none;
   - the first send opens exactly one session and prompts it; the header
     shows `cwd`, model and thinking;
   - switching with a held turn: type a draft in Garden, send, switch to
     Beds while Garden's item is `aria-busy`, Beds shows Send and an empty
     composer, a prompt from Beds carries `session-2`, release Garden's
     turn fully and wait for its item to settle while Beds is shown, Beds
     shows nothing of it, back in Garden the draft and the whole answer,
     Stop before settle and `session.abort` carries `session-1`, each
     Journey opened once;
   - a held `session.open`: send in Garden, switch to Beds, release — Beds
     stays current, Garden's entry is open;
   - no project path: pick it, the reason and command shown, no composer,
     no `session.open`;
   - `models: []`: the characterization test of today's gating first, then
     the shell's rule — sidebar listed, sign-in panel in the area, a pick
     sends no `session.open`;
   - `journeys.list` → `mirror_not_configured`: heading, detail, "Try
     again" re-requests;
   - `hello` → `unauthorized`: the area's statement and "Try again"
     reconnects, the sidebar empty;
   - `session.open` → `session_open_failed`: failure and path in the area,
     item still current, draft kept, send again re-sends `session.open`;
   - the empty sidebar state;
   - the moved proof test and the mid-turn leak test.
7. **Unit tests**: `journeyTree` (a reverse-alphabetical fixture with mixed
   case and an accented name against the core's order; a grandchild at
   level 3; a self-parent and a two-node cycle terminating with both at the
   root; all inactive and zero Journeys); `shortenHome`; every store action
   above; `resetAllStores` registration.
8. **Docs:** AGENTS.md's shape (`<concern>/store.ts`, the selector rule);
   D7's "resume the most recent by default" unchanged, a D14 recording lazy
   open as the shell's gesture; the roadmap rows; the worklog.

## Non-Goals

- Do not implement sibling roadmap item: Mirror's tokens and theme (TS2).
  No palette, type, state or motion tokens, no theme control, no chrome
  polish beyond what the shell's structure needs; Sparkles and Compass go
  with the console, nothing replaces them.
- Do not implement sibling roadmap item: Transcript rendering (US2). The
  transcript rows render as the console rendered them.
- Do not implement sibling roadmap item: Composer (US3), beyond the draft
  per Journey: Escape and the reasons it cannot send stay US3's.
- No sessions list, resume, steer, stop from the sidebar, model picker,
  automatic reconnection or quit and restart hygiene (CV1.DS2).
- No "settled while unseen" marker, tree keyboard navigation, sidebar
  resizing, journey icons, command palette or localization.
- No protocol change, no new dependency.

## Acceptance Behavior

```text
Given a fake host whose Journeys are Garden (active), Beds (active, parent garden), Attic (paused) and Loft (active, parent attic)
When the shell renders
Then the list shows Garden at level 1 with Beds at level 2 under it, and Loft at level 1
And Attic is not shown

Given Garden has a project path
When the person picks Garden, twice
Then Garden's item is aria-current, the header shows "Garden" and "~/garden", the composer is shown
And the fake host received no session.open

Given Garden is picked and a model exists
When the person types "Hello" and presses Enter
Then the fake host received exactly one session.open for garden, then one session.prompt for session-1 with "Hello"
And the header shows the session's cwd, the model and the thinking level

Given Garden's turn is held, a draft typed in Garden after sending, and Beds picked while Garden's item is aria-busy
When the person types in Beds, sends a prompt, and the held turn is released while Beds is shown
Then Beds' composer started empty, Beds offered Send not Stop, its prompt carried session-2
And after Garden's item is no longer aria-busy, Beds shows nothing of Garden's turn
And back in Garden, its draft, "Hello" and the whole answer are there
And the fake host received one session.open for garden and one for beds

Given Garden's session.open is held
When the person sends in Garden, picks Beds, and the open is released
Then Beds stays current and Garden's entry is open

Given a Journey without a project path
When the person picks it
Then the area says it has no project path yet and shows the set-path command, there is no composer
And the fake host received no session.open

Given models: []
When the shell renders and the person picks Garden
Then the sidebar is listed, the area shows the sign-in panel, and no session.open was sent

Given hello answered with unauthorized
When the shell renders
Then the area says the host could not be reached and offers Try again, and the sidebar lists nothing
And Try again sends hello again

Given journeys.list answered with mirror_not_configured
When the shell renders
Then the sidebar shows a heading in the product's voice, the host's message beneath, and Try again
And Try again sends journeys.list again

Given session.open answered with session_open_failed
When the person sends in Garden
Then the area names the failure and "~/garden", Garden stays current, the draft is kept
And sending again sends session.open again

Given the whole suite
When npm test runs from the root
Then every test is green, and the console's two tests are present by name under the shell's file
```

## Approach

Test first, one slice at a time, each slice committed:

1. `journeyTree`, `shortenHome`, the transcript reducer moved with its
   test.
2. The stores with their actions, as pure state with a stub client.
3. The fake host's `failures` and held `session.open`, with harness tests.
4. The characterization test of today's no-model gating, on the console.
5. The shell on the stores, UI test by UI test; the console's two tests
   moved last so they move rather than break.
6. The console files removed; docs; the gate; the validation route.

Elements are found by role, label or text; the nested list by `listitem`
and `aria-level`; `data-testid` only if nothing accessible names an
element. The boundary test keeps holding: app code never imports the
harness.

## Risks

- **Store state leaking between tests.** `resetAllStores()` in `renderApp()`,
  the registration test, and one test that renders twice and asserts a
  clean start.
- **A vacuous negative in the switching test.** The `aria-busy` marker is
  the settling oracle: the test waits for it to clear before asserting that
  Beds shows nothing.
- **Zustand selectors.** A fresh array from a selector loops
  `useSyncExternalStore`; the rule in the module comment and `useMemo` on
  the tree.
- **The traffic-light inset.** Only the real window shows it; one point of
  the Navigator's run.
- **Two sessions at once against one `memory.db`.** The fake host cannot
  exercise Mirror's single writer under concurrency; the Navigator's run
  checks with the CLI that each prompt was logged under its own Journey.

## Validation Route

- **Automated**, in the [test guide](test-guide.md): the chained gate
  (typecheck, test, build, `git diff --check`); the UI, store and unit
  tests above; the collection diff by test name showing the console's two
  tests under the shell's file; three shuffled runs and 20 consecutive runs
  of the desktop project.
- **Navigator**, in the real app, on two Journeys they name: `npm run dev`;
  the sidebar matches `mirror journeys`; picking shows and writes nothing
  (`mirror conversations` unchanged); the first send opens and the header
  shows where it runs; switching while streaming keeps the draft, the
  stream and the marker; a Journey without a project path says how to set
  one; each prompt logged under its own Journey; the traffic lights clear
  of the sidebar.
- **Pass:** every check and observation holds. **Fail:** any one does not.

E2E decision: required. The shell is what the person sees; the fake host
proves the behavior, the real window proves the layout and the inset, and
the real host proves two sessions logging under the right Journeys.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.US1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- A new capability starts with its schema and test, then the host, then the
  UI; this story adds none.
- Nothing is written to Mirror by selecting a Journey.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- the shell needs a protocol change or a new dependency
- the stores cannot be isolated between tests without touching app behavior
- the real run would open a Journey the Navigator has not named

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
