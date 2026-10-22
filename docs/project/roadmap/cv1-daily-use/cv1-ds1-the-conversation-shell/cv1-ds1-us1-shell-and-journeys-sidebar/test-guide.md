[< Story](index.md)

# Test Guide — CV1.DS1.US1

## Automated Validation

From the repository root. The commands are as planned. Implementation
finalizes them and records their output under Validation Evidence.

1. **The gate**, chained so that a failed step can never print success:

   ```bash
   npm run typecheck && npm test && npm run build && git diff --check && echo "gate green"
   ```

2. **The shell's UI tests**, on their own:

   ```bash
   npx vitest run apps/desktop/src/shell apps/desktop/src/App.test.tsx --project desktop
   ```

   Expected, sixteen tests, green:
   - `Sidebar.test.tsx`: the hierarchy; a picked Journey opens nothing,
     double click included, until the first send; no project path (the
     reason, the command, Refresh, and its child opening alone); no active
     Journeys (the hidden count, Refresh); Mirror not set up (the heading,
     the host's words once, `mirror init`, Try again).
   - `Conversation.test.tsx`: the first send opens once and the header shows
     the session's `cwd`, model and thinking; switching with a held turn
     (draft, `aria-busy`, Send not Stop in Beds, `session-2`, nothing of
     Garden's in Beds); Stop reaching `session-1`; a held `session.open`
     keeping Beds on screen; a failed open named in place, the message back
     in the composer, the next send retrying.
   - `Shell.test.tsx`: the host out of reach (the statement, the host's words
     once, nothing to pick, Try again connecting); About and Sign in.
   - `App.test.tsx`: the moved proof test; the moved mid-turn test; a clean
     start on every render; no model to use.

3. **The stores, the tree and the helpers**, as pure state:

   ```bash
   npx vitest run apps/desktop/src/host apps/desktop/src/journeys apps/desktop/src/conversations apps/desktop/src/stores --project desktop
   ```

4. **Collection, by test name.** `BASE` is the last commit before US1's
   implementation:

   ```bash
   BASE=<sha recorded in the evidence>
   git worktree add --detach ../mirror-desktop-us1-BASE "$BASE"
   (cd ../mirror-desktop-us1-BASE && npm ci && npx vitest list > /tmp/us1-BASE.tests)
   npx vitest list > /tmp/us1-STORY.tests
   diff /tmp/us1-BASE.tests /tmp/us1-STORY.tests
   git worktree remove ../mirror-desktop-us1-BASE
   ```

   Expected: `reduceRows.test.ts` is gone and its tests live beside the
   moved reducer; the console's two tests ("opens a Journey, sends a
   prompt…" and "can end in the middle of a turn…") are present under the
   shell's file, reworded for lazy open; every other test at `BASE` is
   still listed; the additions are US1's.

5. **Determinism:**

   ```bash
   for seed in 20261022 3 7; do npx vitest run --project desktop --sequence.shuffle --sequence.seed=$seed || echo "failed on seed $seed"; done
   for i in $(seq 20); do npx vitest run --project desktop || { echo "failed on run $i"; break; }; done
   ```

   Expected: green every time.

## E2E Decision

Required. The shell is what the person sees: the fake host proves the
behavior, the real window proves the layout and the traffic-light inset,
and the real host proves two sessions logging under the right Journeys. The
run happens on two Journeys the Navigator names, `<first>` and `<second>`,
because the first send in each binds a Mirror conversation to it.

## Navigator Validation

1. **The sidebar is Mirror's list.** From the repository root
   (`mirror-desktop-app`, not the first body's `mirror-desktop`), run
   `npm run dev`. Beside it, run `mirror journeys`.
   Observe: the sidebar shows your active Journeys, each child nested under
   its parent as the command groups them, in the same order, inactive ones
   absent. The traffic lights sit clear of the sidebar and the window drags
   by its top edge.
2. **Picking writes nothing.** Before clicking anything, run
   `mirror conversations --journey <first> --limit 3` and the same for
   `<second>`. Click `<first>`, then `<second>`, then `<first>` again.
   Observe: each shows its name, its project path with your home as `~`,
   and a composer; run both listings again: unchanged.
3. **The first send opens the Journey where it says.** In `<first>`, send
   `Reply with the single word: pong`.
   Observe: a muted "Opening in …" line, then the answer streams; the
   header now shows the session's path, model and thinking level;
   `mirror conversations --journey <first> --limit 3` shows one new
   conversation at the top, tagged `[<first>]`.
4. **Switching keeps the conversation, the draft and the marker.** Type
   half a prompt in `<first>` without sending. In `<second>`, send
   `Count from 1 to 40, one number per line.` and, while it streams, click
   `<first>`.
   Observe: `<second>`'s sidebar item shows a spinner until its answer
   settles; `<first>` shows its earlier answer and your half-typed draft;
   back in `<second>`, the whole count is there.
   `mirror conversations --journey <second> --limit 3` shows one new
   conversation, tagged `[<second>]`, and `<first>`'s listing gained
   nothing.
5. **A Journey without a project path says how to get one.** Pick an
   active Journey with no project path; five had none on 2026-10-21:
   `campos-houses`, `flip`, `kia`, `niteroi-apartment` and `real-estate`.
   (The CLI cannot clear a path: `mirror journey set-path <slug> ""` stops
   at its usage line.)
   Observe: the area says it has no project path yet and shows the
   `set-path` command; there is no composer; Refresh asks Mirror again,
   with the list staying on screen.
6. **The host cannot be reached.** Not reproducible by hand in this build:
   the shell starts its own host on a port of its own, so nothing outside
   can hold that port, and a host that never starts leaves the app waiting
   for it, the cold-start path CV1.DS2.TS1 owns. The fake host proves the
   statement and Try again (`Shell.test.tsx`). Record "host unreachable: not
   manually verified" in the evidence.
7. **The console is gone.** `git ls-files apps/desktop/src | grep -i
   console`; open `App.tsx`.
   Observe: nothing named console; `App.tsx` composes the shell.

Pass: every observation holds. Fail: any one does not.

## Validation Evidence

Recorded on 2026-10-21.

- `BASE` is `19134f8`, the approved plan, the last commit before US1's
  implementation.
- `STORY` is `0fdcbea`.

**The gate.** Typecheck, `npm test`, build and `git diff --check` are green.
`npm test` runs 146 tests in 19 files: 12 in `node`, 134 in `desktop`. The
window capability changed, so `cargo check` ran too: green.

**Collection, by test name.** Every test at `BASE` is still collected, or
moved by name:

- the four `reduceRows` tests, from `src/reduceRows.test.ts` to
  `src/conversations/transcript.test.ts`, unchanged;
- the console's two UI tests, in `src/App.test.tsx`, now under "the shell
  against the fake host": "can end in the middle of a turn…" with its name,
  and the proof test reworded for lazy open, "picks a Journey, sends a
  prompt, and watches the answer stream in until the turn settles".

The additions are US1's 81, each collected once: 18 in the conversations
store, 10 in the connection, 6 in the Journeys store, 5 in the tree, 6 in
`shortenHome`, 3 in the store registry, 13 in the fake host, 12 UI tests in
`shell/`, and 4 in `App.test.tsx` (the two moved, a clean start, and no
model). The node set is unchanged.

**Red runs.** Each mutation turned the tests that own it red, and was then
reverted:

| Mutation | Red |
|---|---|
| Host events applied to the conversation on screen, not the session's owner | the store's routing tests; the switching and held-open UI tests |
| No reset guard, so a send still waiting writes after a reset | the store's isolation test |
| A failed open leaves the message in the transcript | the store's failed-open test |
| No refusal while a session opens or a turn runs | the store's open-once and running tests |
| A given-up connection is not closed (the lease ignored) | the connection's lease test; the proof test, the switching and the held-open UI tests, where every event arrived twice |
| Selecting a Journey opens its session, as the console did | nine of the sixteen UI tests, the proof test among them |
| The working marker never shown | the switching and held-open UI tests |
| The conversation not keyed by Journey | nothing: no per-Journey state lives in the component since drafts moved into the store. The key stays for the local state US2 will add; no test proves it today |

**Determinism.** Green with `--sequence.shuffle` and the seeds 20261022, 3
and 7, and in 20 consecutive runs of the `desktop` project.

**The tree's order is the core's.** The expected outline in `tree.test.ts`
is what the Mirror core's own `listJourneyOptions` (mirror-mind 0.35.0)
printed for the same rows: `apple`, `root`, `Seed`, `Sprout` under `Seed`,
`Banana`, `Mango`, `Zinnia`, `écoles`. It ran on a copy of
`journeyOptions.ts` and `parentJourney.ts`, because Node will not strip
types under `node_modules`.

**Beyond the plan's letter**, named so the review can judge them:

- *Refresh* in the no-active-Journeys and no-project-path states, and the
  sidebar keeping its list on screen while it looks again. Both states name
  a fix made outside the app; without a way to look again, the next step
  would have been a restart.
- Three fake-host answers the approved tests needed: `auth.providers` for
  the sign-in panel, `session.abort` for Stop's routing (its effect on a
  turn stays unplayed), and a session `cwd` differing from the listed path.
- `core:window:allow-start-dragging` in the window's capability: the
  console's drag region never had it, so the overlay title bar could not
  move the window.
- The plan's switching scenario corrected (`0fdcbea`): the draft kept is
  the one typed after sending.

**Navigator validation.** Pending: the route above, on two Journeys the
Navigator names.
