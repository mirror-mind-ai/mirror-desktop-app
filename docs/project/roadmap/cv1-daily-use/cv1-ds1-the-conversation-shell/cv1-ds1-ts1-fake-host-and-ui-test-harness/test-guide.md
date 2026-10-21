[< Story](index.md)

# Test Guide — CV1.DS1.TS1

## Automated Validation

From the repository root. The commands are as planned. Implementation
finalizes them and records their output under Validation Evidence.

1. **The gate**, chained so that a failed step can never print success:

   ```bash
   npm run typecheck && npm test && npm run build && git diff --check && echo "gate green"
   ```

2. **Collection, artifact and committed state.** `BASE` is the last commit
   before TS1's implementation, and `STORY` is the story's last commit. Both
   are recorded in the evidence. Each is built from a fresh worktree:

   ```bash
   BASE=<sha recorded in the evidence>; STORY=$(git rev-parse HEAD)
   for pair in "BASE:$BASE" "STORY:$STORY"; do
     rev="${pair%%:*}"; sha="${pair#*:}"; dir="../mirror-desktop-ts1-$rev"
     git worktree add --detach "$dir" "$sha"
     (cd "$dir" && npm ci \
       && npx vitest list --filesOnly > "/tmp/ts1-$rev.files" \
       && rm -rf apps/desktop/dist && npm run build \
       && (cd apps/desktop/dist && find . -type f | sort | xargs shasum -a 256) > "/tmp/ts1-$rev.dist" \
       && node -e 'const l=require("./package-lock.json").packages;console.log(JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k,v])=>k.includes("node_modules/")&&!v.dev)),null,1))' > "/tmp/ts1-$rev.prod-deps")
   done
   (cd ../mirror-desktop-ts1-STORY && npm test) && echo "committed state green"
   diff /tmp/ts1-BASE.files /tmp/ts1-STORY.files
   diff /tmp/ts1-BASE.dist /tmp/ts1-STORY.dist
   diff /tmp/ts1-BASE.prod-deps /tmp/ts1-STORY.prod-deps && echo "production dependencies identical"
   git worktree remove ../mirror-desktop-ts1-BASE && git worktree remove ../mirror-desktop-ts1-STORY
   ```

   Expected:
   - **Files:** every file listed at `BASE` is still listed. The only
     additions are TS1's test files, each listed once, the desktop ones
     under the `desktop` project.
   - **Dist:** the JS files are identical. A CSS difference is allowed only
     for rules that existed because Tailwind scanned `reduceRows.test.ts`,
     and each one is listed in the evidence.
   - **Production dependencies:** identical.
   - **Committed state:** `npm test` is green in the fresh worktree.

3. **Red runs.** Apply each mutation and run
   `npx vitest run apps/desktop/src/App.test.tsx --project desktop`. See the
   proof test fail, then revert. Each result is recorded:
   - `reduceRows` replaces the assistant text instead of appending to it;
   - `agent_settled` no longer clears busy;
   - the `if (cancelled)` branch in App's connect effect is removed;
   - the fake host delivers every event twice;
   - the proof test's world opens a different Journey than the test
     expects.

4. **Determinism:**

   ```bash
   npx vitest run --project desktop --sequence.shuffle --sequence.seed=20261021
   for i in $(seq 20); do npx vitest run --project desktop || { echo "failed on run $i"; break; }; done
   ```

   Expected: green every time.

5. **Structure capture**, on a Journey the Navigator names:

   ```bash
   npm run turn --workspace packages/host -- --journey <slug> --prompt "Reply with the single word: pong"
   ```

   Only the sequence of event types, roles and stop reasons is recorded,
   never the content. `streamed-answer.json` follows that sequence.

## E2E Decision

Not required. The waiver rests on artifact identity: the shipped JS is
byte-identical, and every CSS difference is listed and explained. If anything
else differs, stop and run the real app. Accepted with the plan.

## Navigator Validation

1. **Both projects run in one command.** Run `npm test`.
   Observe: the `node` and `desktop` projects are both listed, and everything
   is green.
2. **Forbidden things fail by name, even when swallowed.** Make each change,
   run `npm test`, observe, then revert:
   - In the first test of `apps/desktop/src/App.test.tsx`, add
     `await fetch("https://example.com").catch(() => {});`.
     Observe: the test fails naming `https://example.com`.
   - Remove the scripted turn from that test's world.
     Observe: the test fails naming `session.prompt` and saying no turn was
     left.
   - In `apps/desktop/src/testing/fixtures/streamed-answer.json`, change one
     `"text_delta"` to `"text_deltaa"`.
     Observe: the failure names `streamed-answer.json`, the event's index and
     the problem.
3. **The proof test is what it claims.** Open `App.test.tsx` and check that:
   - it imports only the harness, Testing Library and protocol types;
   - no socket, port or token appears in it;
   - its world names its Journey, its model and its fixture;
   - it finds elements by role, label or text.
4. **The evidence is complete.** Read the Validation Evidence below and check
   that it contains:
   - JS identical, and each CSS difference listed and explained;
   - the committed state green;
   - the red runs and the determinism runs recorded;
   - the structure capture matching.

Pass: every observation holds. Fail: any one does not.

## Validation Evidence

Recorded on 2026-10-21.

- `BASE` is `1c971ea`, the last commit before TS1's implementation.
- `STORY` is `4e6b6b3`, the commit that completes it.

**The gate.** Typecheck, `npm test`, build and `git diff --check` are green.
`npm test` runs 69 tests in 10 files: 12 in `node`, 57 in `desktop`.

**Collection.**

- Both files collected at `BASE` are still collected:
  `packages/protocol/src/index.test.ts` under `node`, and
  `apps/desktop/src/reduceRows.test.ts` under `desktop`.
- The additions are TS1's eight test files, each collected once, under
  `desktop`.

**Artifact identity.**

- Built from fresh worktrees after `npm ci`, `BASE` and `STORY` produce
  byte-identical dist files: `index-Bg215EXL.js`, `index-Cq9PZ48Z.css` and
  `index.html`, with the same SHA-256.
- No CSS rule came from scanning `reduceRows.test.ts`, so there are none to
  list.
- The Tailwind exclusion is what keeps the CSS identical. With the
  `@source not` lines removed, the CSS changed: the harness's own words became
  rules.
- The production dependencies in the lockfile are identical.

**The committed state.** In the `STORY` worktree,
`npm ci && npm test && npm run build` is green: 69 tests.

**Red runs.** Each mutation turned the proof test red and was then reverted:

| Mutation | Failure |
|---|---|
| `reduceRows` replaces the assistant text instead of appending to it | no element whose text is exactly `"Tides turn slowly\n"` |
| `agent_settled` no longer clears busy | Send never comes back |
| the `if (cancelled)` branch is removed | the answer is not found exactly: it renders twice |
| the fake host delivers every event twice | the answer is not found exactly |
| the console opens a different Journey | the composer never appears; both tests fail, and the unscripted `session.open` is recorded |

The harness's own checks were broken on purpose too:

- A swallowed `fetch`, a `console.error` and a socket to another address each
  failed at teardown, by name.
- The script canary failed with script evaluation switched on.
- The boundary test failed when `App.tsx` imported the harness.

**Determinism.** All green:

- `--sequence.shuffle --sequence.seed=20261021`;
- seed 3, which runs the mid-turn test before the proof test;
- 20 consecutive runs of the `desktop` project.

**Structure capture.** One real turn was run on the Journey the Navigator
named, `nomadic-life`, with `npm run turn` and the prompt "Reply with the
single word: pong". Only its structure is recorded:

```text
prompt accepted → agent_start → message_start → message_end system
→ message_start → message_end user → message_start → text_delta (one or more)
→ message_end assistant (stop) → agent_end → agent_settled
```

- There were no thinking, tool or retry events.
- The prompt's reply arrived before `agent_start`.
- `streamed-answer.json` follows this sequence with four invented text deltas.
  The system message pair it carries is there because the capture found it.

**Navigator validation.** Accepted by the Navigator on 2026-10-21, after the
four steps above.

**After the debt payment** (`9e0122e`): the gate is green with 71 tests, and
the built app is still byte-identical to `BASE`.
