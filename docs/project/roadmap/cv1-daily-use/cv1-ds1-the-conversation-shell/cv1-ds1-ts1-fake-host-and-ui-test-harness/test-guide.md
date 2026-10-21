[< Story](index.md)

# Test Guide — CV1.DS1.TS1

## Automated Validation

From the repository root:

```bash
npm run typecheck
npm test
npm run build
git diff --check
grep -rl "fake host" apps/desktop/dist; test $? -eq 1 && echo "no harness in the built app"
```

Expected: every command passes. `npm test` lists the node tests and the UI
tests in one run, all green. The last line prints
`no harness in the built app`.

## E2E Decision

Not required: TS1 changes no production code, and the proof test drives the
real `App` and `HostClient` against the fake host. Accepted with the plan.

## Navigator Validation

1. **Both kinds of test run in one command.** Run `npm test`.
   Observe: the existing node tests, plus the UI test in
   `apps/desktop/src/App.test.tsx` and the harness tests in
   `apps/desktop/src/testing/fakeHost.test.ts`, are all green.
2. **No network.** Turn Wi-Fi off and run `npm test` again.
   Observe: still green.
3. **A broken fixture fails by name.** In
   `apps/desktop/src/testing/fixtures/streamed-answer.json`, change one
   `"text_delta"` to `"text_deltaa"` and run `npm test`.
   Observe: the failure names `streamed-answer.json` and the event it cannot
   read. Revert the change and run `npm test` again; it is green.
4. **The proof test reads like the outcome.** Open
   `apps/desktop/src/App.test.tsx`.
   Observe: it scripts a fake host, opens a Journey, sends a prompt and
   asserts the answer, with no knowledge of Pi, models or sockets.
5. **Nothing of the harness ships.** Run the last two automated commands
   (`npm run build` and the `grep`).
   Observe: `no harness in the built app`.

Pass: all five observations hold. Fail: any one does not.

## Validation Evidence

Pending implementation and validation.
