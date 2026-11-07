# Validation — CV1.DS2.US3

## Status

Blocked

## Automated Checks

- npm run typecheck (clean); npm test (504 passed in 45 files); npm run build; git diff --check; story tests per test-guide.md; desktop project shuffled with seeds 1-3 (402 passed each); the parity test runs Pi's own createAgentSession over every branch of the start rule; the clamp pinned to pi-ai's over 1,599 models; seven mutation checks caught (the level set before setModel's switch rule, the per-model level on a resume, a change and a prompt out of order, the pick not carried on the open, a look keeping the pick, a list not taking Escape first, session.open taking a model without its level); the bundle stages pi-ai 1.4.0 and the built app starts and quits cleanly; the real host refuses a 0.6.0 client and answers mirror-desktop's defaults as Pi's settings and its newest session's resumes as the file's own; Pi's settings unchanged

Checks status: passed

## E2E

Decision: required

Evidence: Pending: one real turn with --model and --thinking on a Journey the Navigator names, then the Navigator's 11-step route in the window with the session files and Pi's settings as witnesses; and a Navigator decision first: the host offers 426 models (401 from OpenRouter, signed in by Mirror's configuration), where the plan's non-goal of a search in the model list rested on 25

## Navigator Validation

Route: test-guide.md, Navigator Validation: npm run dev; on a Journey the Navigator names, read the header before any send against the newest file's last entries; New session shows Pi's default (sonnet-5-5, medium); the thinking list shows only sonnet-5-5's levels; pick haiku and low before the first send and send; a new session on gpt-6-luna at off; switch the open session to sonnet-5-5 and see off move to low; change the level and the model during a multi-tool run, Escape with a list open; pick on an older file and send; relaunch; pi -r once after quitting; diff Pi's settings files

Navigator accepted: no

Expected observation: The header always says what the next answer runs on: a file's own before it opens, Pi's default for a new session, a held pick in ink until the first send carries it, the open session's own once open; only the model's levels are offered, each in Pi's words; a model pick moves a level the model lacks to the nearest one and says so; a change on the open session and during a run lands in the session file and the next request runs on it, the run uninterrupted; Escape with a list open never stops a turn; the header fits at 860; Pi's settings files are unchanged

Pass condition: Every observation in the 11 steps holds

Fail condition: Any observation fails; or the header shows a model or level other than the one the next answer runs on once the host has answered; or a pick before a send opens or writes anything; or a change is missing from the session file; or a change during a run stops, fails or restarts the turn; or Escape with a list open stops a turn; or a model or thinking key in Pi's settings changes

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:dbcec575010f84363b4752aa65eb7fcfd97805795a132917592189a503d2c321 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
