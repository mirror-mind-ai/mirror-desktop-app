# Review — CV1.DS2.US3

## Status

Pending debt decision

## Debt Findings

- Measured first: the conversations store grew from 524 to 650 lines, the fake host from 864 to 1,028, the protocol from 569 to 658; the sessions list shrank from 182 to 122 with the listbox extracted; the UI bundle grew 10.7 kB to 774.6 kB, 25 kB under the 800 kB tripwire. (1) The desktop offers 401 OpenRouter models terminal Pi cannot use: OPENROUTER_API_KEY lives only in Mirror's configuration (~/.config/mirror/env), which the host loads into its own environment; Pi's auth.json holds Anthropic and OpenAI Codex only, no shell profile exports the key, and terminal Pi without it lists no OpenRouter model. A session the desktop moves to an OpenRouter model records it, and pi -r in a terminal then falls back with Pi's Could not restore line: the two surfaces stop sharing one session's model. The mechanism is older than US3 (the host has loaded Mirror's configuration since the spikes); US3 makes it selectable. Proposal: defer as a Change Request under RS002 Host Runtime; its fix is a product choice (list only providers Pi itself has a credential for, sign OpenRouter into Pi's auth.json, or accept the desktop as a superset). (2) A busy control loses the keyboard focus: a pick closes the list and focuses its button, then the change makes both buttons disabled while the host answers, and by the HTML focus fix-up rule a focused element that becomes disabled gives the focus back to the body; happy-dom does not model it, so no test sees it, and I could not confirm WebKit's exact behavior. Beside it, the two controls repeat their placeholder button, their busy glyph and their popover wiring, so this fix would be made twice, and HeaderList.tsx reads the store to word its foot line. Proposal: pay now: one control button for both (busy as aria-disabled, the focus kept, picks already refused by the store while a change waits), the foot line's rule moved to headerChoice.ts and tested as a function, behavior otherwise unchanged. (3) The fake host's model rules (defaults, what a file resumes on, Pi's fallback line) are written by hand from the real host's, which the parity test checks against Pi; nothing checks the fake against the host. Proposal: defer to the ledger as TD-007, beside TD-006, revisited when modelChoice.ts's start rule changes or at the next Pi upgrade. (4) Copies of Pi 1.4.0: the start rule (checked against Pi by the parity test, which fails on drift), the clamp (pinned to pi-ai over every model), and Pi's level descriptions (words, unchecked). Terminal Pi is already 1.5.2 while the desktop pins 1.4.0, so the next bump will exercise the parity test. Proposal: no action. (5) A mid-run model change has a window, seen in the route's file: Pi's setModel writes its switch-rule level (medium) and awaits its model_select event before the host sets the level the person chose, so a request prepared in that window runs on the interim level, and the file keeps the interim entry. Only Pi can close it, with a setModel that takes the level. Proposal: no action here; named as a candidate for Pi. (6) The filter matches words as substrings, where Pi's /model filters fuzzily; and the store holds the choice actions beside the rules' pure module, since they need its private update and epoch. Proposal: no action.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:e4e3bf3ee30b79de6d542846633a952e275bc9bd6bb48056325fdf48fe414d16 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
