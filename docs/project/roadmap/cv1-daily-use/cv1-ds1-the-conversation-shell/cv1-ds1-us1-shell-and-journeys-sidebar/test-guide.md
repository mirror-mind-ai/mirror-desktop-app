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

   Expected, one test each, as the plan lists them: the hierarchy and the
   pathless parent; picking writes nothing (double click included); the
   first send opens once and the header shows `cwd`, model and thinking;
   switching with a held turn (draft, `aria-busy`, Send not Stop in Beds,
   `session-2`, nothing of Garden's in Beds, abort carrying `session-1`);
   the held `session.open`; no project path; `models: []`;
   `mirror_not_configured` with Try again; `unauthorized` on `hello` with
   Try again; `session_open_failed` with retry; the empty sidebar; the
   moved proof test; the moved mid-turn leak test.

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

1. **The sidebar is Mirror's list.** Run `npm run dev`. Beside it, run
   `mirror journeys`.
   Observe: the sidebar shows your active Journeys, each child nested under
   its parent as the command groups them, in the same order, inactive ones
   absent. The traffic lights sit clear of the sidebar and the window drags
   by its top edge.
2. **Picking writes nothing.** Note the last line of `mirror conversations`.
   Click `<first>`, then two other Journeys, then `<first>` again.
   Observe: each shows its name, its project path with your home as `~`,
   and a composer; `mirror conversations` has not changed.
3. **The first send opens the Journey where it says.** Type a short prompt
   in `<first>` and press Enter.
   Observe: a muted "Opening in …" line, then the answer streams; the
   header now shows the session's path, model and thinking level;
   `mirror conversations` shows one new conversation under `<first>`.
4. **Switching keeps the conversation, the draft and the marker.** Type
   half a prompt in `<first>` without sending; send a prompt in `<second>`;
   while it streams, click `<first>`.
   Observe: `<second>`'s sidebar item is marked as working until its answer
   settles; `<first>` shows its earlier answer and your half-typed draft;
   back in `<second>`, the whole answer is there. `mirror conversations`
   shows one conversation under each Journey, each with its own prompt.
5. **A Journey without a project path says how to get one.** Pick one (or
   record `mirror journeys`, clear a scratch Journey's path with
   `mirror journey set-path <slug> ""`, and restore it from the record
   after).
   Observe: the area says it has no project path yet and shows the command;
   there is no composer.
6. **The host cannot be reached.** Quit the app, run
   `MIRROR_HOST_TOKEN=x npm run host` so the port is held by a host the
   shell did not start, then `npm run dev`; or stop the host from the
   process list after launch.
   Observe: the area says the host could not be reached and offers Try
   again; the sidebar lists nothing. If this step cannot be reproduced on
   your machine, record "host unreachable: not manually verified" in the
   evidence.
7. **The console is gone.** `git ls-files apps/desktop/src | grep -i
   console`; open `App.tsx`.
   Observe: nothing named console; `App.tsx` composes the shell.

Pass: every observation holds. Fail: any one does not.

## Validation Evidence

Pending implementation and validation.
