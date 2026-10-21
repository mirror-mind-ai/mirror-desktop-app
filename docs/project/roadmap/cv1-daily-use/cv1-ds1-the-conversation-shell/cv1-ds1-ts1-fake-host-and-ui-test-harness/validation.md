# Validation — CV1.DS1.TS1

## Status

Passed

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 69 tests. Fresh worktrees: base 1c971ea and story 4e6b6b3 build byte-identical dist files; production dependencies identical; npm ci && npm test && npm run build green at the story commit. Five mutations turn the proof test red. Shuffled seeds 20261021 and 3, and 20 consecutive desktop runs: green.

Checks status: passed

## E2E

Decision: not_required

Evidence: No production behavior changed: the built app is byte-identical to the base commit (JS, CSS and HTML), so the plan's waiver stands on artifact identity.

## Navigator Validation

Route: The four steps in the TS1 test guide: run npm test; make three deliberate violations (a swallowed fetch, a missing scripted turn, a broken fixture) and see each fail by name; check four statements about App.test.tsx; read the recorded evidence.

Navigator accepted: yes

Expected observation: Both projects green; each violation fails naming what was attempted; App.test.tsx imports only the harness, Testing Library and protocol types, with no socket, port or token; the evidence records identity, committed state, red runs, determinism and the structure capture.

Pass condition: Every observation in the test guide holds.

Fail condition: Any observation does not hold.

## Missing Evidence

- none
<!-- ariad-seal sha256:55a1a2132d0e352fb4f791c199de83d5d5ef64ecdfe900c752d5476d71d3f0b5 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
