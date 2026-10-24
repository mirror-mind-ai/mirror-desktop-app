# Validation — CV1.DS1.US2

## Status

Passed

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 248 tests (12 node, 236 desktop); the desktop project green under shuffle seeds 1, 2 and 3; each rule the story stands on broken once by hand and caught by its test; green again after the three styles drawn at validation (89ffff6)

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator ran the route in the real app beside Pi in iTerm, eighteen captures in both themes (test-guide.md, Validation Evidence): Markdown in Pi's roles, Copy and the link's tooltip, tool calls on Mirror Desktop (success with ten lines and a count, failure), the view held with Jump to latest, the retry sequence with Wi-Fi off, light legible; steps 2, 3, 5 and 6 accepted in full on his word

## Navigator Validation

Route: npm run dev, Appearance dark, a Journey the Navigator names, beside Pi in iTerm: test-guide.md steps 1-8

Navigator accepted: yes

Expected observation: Each Markdown element in Pi's role with no syntax shown, Copy exact, links outside the window, Pi's folded tool calls, thinking folding once the answer begins, the view following only at the bottom, retries and errors named, light legible

Pass condition: Every observation in test-guide.md's eight steps holds; step 7 by its own rule

Fail condition: Any observation does not hold, or the app navigates away on a link, the clipboard refuses, the view jumps while scrolled up, or the URL title does not show on hover

## Missing Evidence

- none
<!-- ariad-seal sha256:2c0d8af15a53621fa3f22b122ed84e6ed294e7689b0f72041af9c16dc96c2b60 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
