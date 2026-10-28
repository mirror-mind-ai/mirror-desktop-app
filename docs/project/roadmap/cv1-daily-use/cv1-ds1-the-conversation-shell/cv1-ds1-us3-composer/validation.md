# Validation — CV1.DS1.US3

## Status

Passed

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 272 tests; desktop project green under shuffle seeds 1, 2, 3; each rule broken once by hand and its test failed by name

Checks status: passed

## E2E

Decision: required

Evidence: Navigator ran the 9-step route in the window on the automation Journey, 2026-10-28: steps 1-5 passed; step 6 found two defects outside the story (Mirror version pin, host shutdown deadlock), fixed as maintenance 974f219 and 116669f; steps 6, 6b, 7, 8 then passed

## Navigator Validation

Route: npm run dev on automation; the 9 steps in test-guide.md: pick and type without a click, Shift+Enter, the running line and Enter refused, Escape in the box, Escape with focus elsewhere, Escape idle and held, pkill -9 the host mid-answer (crash), pkill the host (stop), Try again, a dead key then Enter

Navigator accepted: yes

Expected observation: Focus lands in the box on pick; the running line stands while Pi answers and Enter sends nothing; Escape stops once from anywhere; a crash shows the lost-connection words, the cut-off line and Try again, no Stop or Send, no toast; a stop shows the clean close with 1001 going away; Try again reports the host did not accept the connection; a composing Enter sends nothing

Pass condition: Every observation in the route's table holds

Fail condition: Any observation does not; Escape clears the draft; a send while running goes silently nowhere; the dead host leaves Stop or Send on screen or says its words twice

## Missing Evidence

- none
<!-- ariad-seal sha256:19458face9369e2c5ca5f38348521e051843724254c9a4b73e2a5f15a52da85d — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
