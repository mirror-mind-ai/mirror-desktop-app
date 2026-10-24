# Validation — CV1.DS1.TS2

## Status

Passed

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 189 tests (12 node, 177 desktop); cargo check green with the two window permissions; desktop project green under shuffle seeds 1, 2 and 3; npm run bundle built the .app and the .dmg

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator ran the TS2 route in the real app on 2026-10-24 and accepted it, with nine captures: dark beside Pi in iTerm on a real conversation (face, weight, ground; Markdown shown as source, US2's); Flip without a project path in both themes; the sign-in panel and an API-key flow with the pulse in both themes; the 'Sign-in cancelled.' toast top right with the danger icon in both themes; hover over both sidebars; 'Mirror TypeScript Core Port' whole in the 288 px sidebar. Launch, cycle, OS following and relaunch accepted without captures. Not manually verified, accepted on UI tests and the token scan: sidebar empty and failed, host unreachable, failed open.

## Navigator Validation

Route: The eight steps in the TS2 test guide: the first frame in each OS appearance; the control's cycle, icon and traffic lights; the OS followed under system; dark kept across a relaunch of the built bundle; dark beside Pi (face, weight, ground); light on its own; every US1 state in both themes, with one motion and no spinner; bold, title and the Navigator's own Journey names in the sidebar

Navigator accepted: yes

Expected observation: No flash at launch in either appearance; each appearance choice applies at once and survives a relaunch of the bundle; system follows the OS; the window reads as Pi in Monaco on the terminal's ground; light is legible and coherent in every state; toasts, sign-in and states sit on the tokens

Pass condition: Every step in the TS2 test guide holds

Fail condition: Any step in the TS2 test guide does not hold

## Missing Evidence

- none
<!-- ariad-seal sha256:488dbc4d5ee0c6448460a598e699ec37ec20bd81e772f03d721a4714ae7a50e2 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
