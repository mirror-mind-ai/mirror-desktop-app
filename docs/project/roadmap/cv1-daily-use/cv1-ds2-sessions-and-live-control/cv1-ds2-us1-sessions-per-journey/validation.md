# Validation — CV1.DS2.US1

## Status

Passed

## Automated Checks

- npm run typecheck (clean); npm test (344 passed, no unhandled error); npm run build; git diff --check; story tests per test-guide.md; mutation checks on the Escape overlay and the read token; the real host's reads (sessions.list, session.transcript, refusals) on mirror and mirror-desktop

Checks status: passed

## E2E

Decision: required

Evidence: One real turn through the host on Automation (session 2026-10-29T19-06-31-033Z_01a1890e, pong, Mirror conversation 83af4af9); the Navigator's 10-step route in the window on Automation with terminal Pi and mirror conversations as witnesses, all steps passed

## Navigator Validation

Route: test-guide.md, Navigator Validation: npm run dev; on Automation, pick it, open the list, pick sessions, send to resume, quit, continue in pi -r, relaunch, New session, the list during a turn, a Journey with no sessions, Mirror Mind (116 sessions)

Navigator accepted: yes

Expected observation: A pick shows the most recent session read from its file and writes nothing to Mirror; the list matches pi -r; a send resumes the shown file (a new Mirror conversation on it) and pi -r continues it; New session starts one; the list cannot pick during a turn and Escape on it does not stop the turn; Mirror Mind lists and shows within a second

Pass condition: Every observation in the 10 steps holds

Fail condition: Any observation fails; or a look writes or closes a Mirror conversation; or pi -r does not continue a resumed session; or Escape on the open list stops a turn; or Mirror Mind takes more than a second

## Missing Evidence

- none
<!-- ariad-seal sha256:ff146ba9cb4be85d6cbc4305294d6eea8ba400eb03a53f9c848eca79be802cec — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
