# Validation — CV1.DS2.US1

## Status

Blocked

## Automated Checks

- npm run typecheck (clean); npm test (344 passed, no unhandled error); npm run build; git diff --check; story tests per test-guide.md; mutation checks on the Escape overlay and the read token; the real host's reads (sessions.list, session.transcript, refusals) on mirror and mirror-desktop

Checks status: passed

## E2E

Decision: required

Evidence: Pending: one real turn through the host on a Journey the Navigator names, then the Navigator's 10-step route in the window with terminal Pi and mirror conversations as witnesses

## Navigator Validation

Route: test-guide.md, Navigator Validation: npm run dev; on a Journey with sessions (automation), pick it, open the list, pick sessions, send to resume, quit, continue in pi -r, relaunch, New session, the list during a turn, a Journey with no sessions, the mirror Journey (116 sessions)

Navigator accepted: no

Expected observation: A pick shows the most recent session read from its file and writes nothing to Mirror; the list matches pi -r; a send resumes the shown file (a new Mirror conversation on it) and pi -r continues it; New session starts one; the list cannot pick during a turn and Escape on it does not stop the turn; the mirror Journey lists and shows within a second

Pass condition: Every observation in the 10 steps holds

Fail condition: Any observation fails; or a look writes or closes a Mirror conversation; or pi -r does not continue a resumed session; or Escape on the open list stops a turn; or the mirror Journey takes more than a second

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:0347a421ab3c20c7e72557d43049321626bee604c2d9ab94fda057cb6a964c0b — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
