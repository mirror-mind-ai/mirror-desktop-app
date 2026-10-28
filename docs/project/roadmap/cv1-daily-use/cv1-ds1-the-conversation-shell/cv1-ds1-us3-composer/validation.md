# Validation — CV1.DS1.US3

## Status

Blocked

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 270 tests; desktop project green under shuffle seeds 1, 2, 3; each rule broken once by hand and its test failed by name

Checks status: passed

## E2E

Decision: required

Evidence: Pending the Navigator's run of the 8-step route in test-guide.md: Escape through the webview with focus elsewhere, a killed host process seen as an unclean close, a dead key composing

## Navigator Validation

Route: npm run dev on a Journey the Navigator names; the 8 steps in test-guide.md: pick and type without a click, Shift+Enter, the running line and Enter refused, Escape in the box, Escape with focus on Jump to latest, Escape idle and held, pkill the host mid-answer, Try again, a dead key then Enter

Navigator accepted: no

Expected observation: Focus lands in the box on pick; the running line stands while Pi answers and Enter sends nothing; Escape stops once from anywhere; the killed host shows the notice with the lost-connection words, the cut-off line and Try again, no Stop or Send, no toast; Try again reports the host did not accept the connection

Pass condition: Every observation in the route's table holds

Fail condition: Any observation does not; Escape clears the draft; a send while running goes silently nowhere; the dead host leaves Stop or Send on screen or says its words twice

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:bcaecd10ea0c208e574de5ded313f92ef1bb06be0a24ae81546a1a7e702f16d2 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
