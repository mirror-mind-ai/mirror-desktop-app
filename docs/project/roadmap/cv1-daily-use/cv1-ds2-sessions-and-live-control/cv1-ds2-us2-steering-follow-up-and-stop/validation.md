# Validation — CV1.DS2.US2

## Status

Passed

## Automated Checks

- npm run typecheck (clean); npm test (402 passed in 41 files, no unhandled error); npm run build; git diff --check; story tests per test-guide.md; desktop project shuffled with seeds 1-3 (338 passed each); five mutation checks caught (the stop's second clear, the stop's race against the stopped run's settle, Option+Enter as follow-up, focus after a stop, the Stopped mark); the real host boots and says hello in protocol 0.6.0, refusing a 0.5.0 client

Checks status: passed

## E2E

Decision: required

Evidence: Real turn on automation (2026-11-05): session bound to automation, 'prompt accepted (started)' with the first event 3.8 s after the prompt, pong answered, logged as 039b206b. Navigator walked the 11-step route in the window on automation with pi -r and mirror recall as witnesses: every check held

## Navigator Validation

Route: test-guide.md, Navigator Validation: npm run dev; Automation, New session (Sonnet 5.5, thinking medium); a multi-tool prompt steered with Enter and followed up with Option+Enter; mirror recall of the conversation; stops by Escape mid-answer, with a queue and a draft, before the first word and during a slow tool; the app quit, the session read in pi -r, then read back in the relaunched app

Navigator accepted: yes

Expected observation: A steer is listed then delivered between Pi's turns and drawn where Pi took it; a follow-up after the answer would have ended; a steered turn is one Mirror turn; Stop keeps the partial answer marked Stopped, puts queued messages back in the draft before the typed text, leaves the session and its Mirror conversation open, and nothing queued reaches the next turn; stops read back from the file marked where they were

Pass condition: Every check in the 11 steps holds

Fail condition: Any check fails; or a queued message reaches a later turn after a stop; or a stop ends or replaces the Mirror conversation; or the steer or follow-up is logged as its own Mirror user message; or a steer or follow-up shows twice or not at all; or Enter while running leaves the draft; or Option+Enter inserts a line

## Missing Evidence

- none
<!-- ariad-seal sha256:774daebc2f3d511881e086584f7e3555a6d8a47e4974f671fee60d0f5bd2023c — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
