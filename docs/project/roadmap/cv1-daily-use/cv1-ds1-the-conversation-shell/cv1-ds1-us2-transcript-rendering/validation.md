# Validation — CV1.DS1.US2

## Status

Blocked

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 248 tests (12 node, 236 desktop); the desktop project green under shuffle seeds 1, 2 and 3; each rule the story stands on broken once by hand and caught by its test

Checks status: passed

## E2E

Decision: required

Evidence: Pending: the Navigator's route in the real app, beside Pi in iTerm (test-guide.md, Navigator Validation, steps 1-8)

## Navigator Validation

Route: npm run dev, Appearance dark, a Journey the Navigator names, beside Pi in iTerm: (1) an answer with two heading levels, a list, a link, inline code, bold, a TypeScript block with a long line, a bare block, a table and a quote; (2) Copy a block and paste it in a terminal; (3) hover then click the link; (4) a turn that runs ls on more than ten entries, then a failing command, folding and opening each call; (5) thinking on, a question the model thinks about; (6) scroll up during a long answer, use Jump to latest, then leave another long answer alone at the bottom; (7) disconnect the network mid-turn; (8) the same transcript in light

Navigator accepted: no

Expected observation: Each Markdown element in Pi's color with no syntax shown (headings #cd9a22 bold at the body size, inline code and markers #a798d7, link #69add0, bare block #68b78d, highlighted code in Pi's syntax colors, long lines wrapped); Copy pastes the exact text; the link opens in the browser and the app stays; tool calls in Pi's folded form with ten lines and a count, on their grounds, opening with no scroll of their own; thinking open while it streams, folded once the answer begins; the view holds when scrolled up and follows when left at the bottom; Retry and Provider error named in their colors; light legible

Pass condition: Every observation in test-guide.md's eight steps holds; step 7 passes on its fixture tests if no retry is observed on a network error

Fail condition: Any observation does not hold, or the app navigates away on a link, the clipboard refuses, the view jumps while scrolled up, or the URL title does not show on hover

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:ec8b64559efb234fa745d893bca669c5f40783c862821d385545daac3ca5ab1a — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
