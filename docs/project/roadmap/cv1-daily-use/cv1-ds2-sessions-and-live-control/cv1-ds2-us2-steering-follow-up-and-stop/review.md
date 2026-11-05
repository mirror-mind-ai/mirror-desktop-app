# Review — CV1.DS2.US2

## Status

Pending debt decision

## Debt Findings

- (1) Mirror loads twice in the desktop host, found by the real turn and older than this story: the host adds its bundled Mirror package and the person's Pi settings load their own (/opt/homebrew/lib/node_modules/mirror-mind), two files Pi 1.4.0 does not dedupe; Mirror 0.38.0 dedupes its handlers by event object, and Pi builds a fresh before_agent_start event for each handler, so both copies log each prompt (twice in Mirror: 039b206b today, US1's 83af4af9 and ab43069c, US3's 7070fc32) and both deliver Mirror's context (the real turn's two custom messages); terminal Pi loads one copy and logs once. The host's own guard workaround, clearing __mirrorLoggerRegistered before each load (sessions.ts), is obsolete: Mirror 0.38.0 no longer reads that key. Proposal: defer as a Change Request in the Refinement Workbench under RS002 Host Runtime, with this evidence; its fix chooses between the host loading one Mirror and a Core-owned prerequisite; US2 changed neither loading nor logging. (2) The conversations store grew from 420 to 615 lines and now holds three concerns: looking at sessions, sending, and the running turn, whose rules (Pi's events folded into the conversation, the merge back into the draft, what a lost host takes along) are pure functions inside it, with running and piRunning overlapping. Proposal: pay now, the running turn's rules moved to conversations/liveTurn.ts and tested as functions, the store calling them, behavior and its tests unchanged. (3) The fake host grew from 686 to 864 lines with the queue and the stop, and its stop (stoppedRun) writes Pi 1.4.0's loop down by hand: which tool and answer events a stop produces, and when the loop asks the model again. Proposal: defer to the ledger, revisited at the next Pi upgrade; the real turn and the route would show a drift in the window meanwhile. (4) A steer waits behind the prompt's preflight: prompts reach Pi one at a time until Pi says the run started, which comes after Mirror's context step (3.8 s measured, with the two copies of (1) both running it); Pi signals nothing earlier. The screen shows Sending meanwhile. Proposal: no action; revisit if daily use finds the wait, or after (1) is fixed. (5) Proven only in the window and against stubs: the registry's wiring of the turn control (prompt serialization, the stop's watchers) has no automated test against a real Pi session, and the fake host cannot fail one prompt after another succeeds, so a refused steer is proven in the store's tests only. Proposal: no action; the first is the development guide's known gap, no isolated real turn. (6) The UI bundle grew about 5 kB to 763.7 kB, under the 800 kB tripwire. Proposal: no action.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:aaa1f863c17cfac34bfa399796d14890459bd80113fa2ca2faa8769eecf39eaa — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
