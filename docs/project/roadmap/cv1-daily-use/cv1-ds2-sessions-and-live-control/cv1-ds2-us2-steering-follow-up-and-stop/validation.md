# Validation — CV1.DS2.US2

## Status

Blocked

## Automated Checks

- npm run typecheck (clean); npm test (402 passed in 41 files, no unhandled error); npm run build; git diff --check; story tests per test-guide.md; desktop project shuffled with seeds 1-3 (338 passed each); five mutation checks caught (the stop's second clear, the stop's race against the stopped run's settle, Option+Enter as follow-up, focus after a stop, the Stopped mark); the real host boots and says hello in protocol 0.6.0, refusing a 0.5.0 client

Checks status: passed

## E2E

Decision: required

Evidence: Pending: one real turn through the host on a Journey the Navigator names, then the Navigator's 10-step route in the window with terminal Pi and mirror conversations as witnesses

## Navigator Validation

Route: test-guide.md, Navigator Validation: npm run dev; on a Journey the Navigator names (automation), send a multi-tool prompt, steer with Enter, follow up with Option+Enter, check pi -r and mirror conversations, stop a long answer with Escape and continue, stop with a queue and a draft, stop before the first word, stop during a slow tool, relaunch and read the stops back

Navigator accepted: no

Expected observation: A steer is listed then delivered between Pi's turns and drawn where Pi took it; a follow-up after the answer would have ended; a steered turn is one Mirror turn; Stop keeps the partial answer marked Stopped, puts queued messages back in the draft before the typed text, leaves the session and its Mirror conversation open, and nothing queued reaches the next turn; stops read back from the file marked where they were

Pass condition: Every observation in the 10 steps holds

Fail condition: Any observation fails; or a queued message reaches a later turn after a stop; or a stop ends or replaces the Mirror conversation; or a steered turn counts as more than one Mirror turn; or a steer or follow-up shows twice or not at all; or Enter while running leaves the draft; or Option+Enter inserts a line

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:20619de8617c02687bfb31df8f46dd93128f9a0db340254cd2f26a501a989fb5 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
