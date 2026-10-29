# Review — CV1.DS2.US1

## Status

Pending debt decision

## Debt Findings

- (1) Two writers on one session file: the desktop keeps a Journey's session open after its turn (as since US1), and resuming made the same files reachable from both sides, so a session continued in pi -r while the desktop holds it open is written by two processes; Pi has no lock, the file splits into two branches, and whichever writes last decides what a later reader shows, the other's lines kept in the file off the branch. The route avoided it by quitting first. Proposal: defer to the ledger as TD-005, revisited by CV1.DS2.TS1 (which owns the session lifecycle: closing an idle session, or reopening from the file when it grew under the host) or the first time it happens in daily use. (2) The fake host grew from 579 to 811 lines, one class now holding a sixth responsibility (sessions on disk, beside the handshake, failures, held opens, turns and going away), and US2 will add the queue to it. Proposal: pay now, the disk extracted into testing/fakeDisk.ts behind the same world and the same tests, while it is fresh. (3) The conversations store grew from 232 to 420 lines with the Journey's sessions list beside the conversation. Proposal: no action; the list exists to decide what the conversation shows, the two change together, and about half the growth is the comments that say so; US2's plan looks again when the queue lands in the same store. (4) The host reads a session file synchronously on a look: 33 ms on the largest file in any Journey (20.7 MB), 175 ms on the largest on disk (75 MB, no Journey's). Proposal: no action; the module comment names the cost. (5) The host carries Pi's session-folder encoding, because Pi's own function creates the folder and is not exported. Proposal: no action; a test holds it to the folder Pi reports. (6) The UI bundle grew 9 kB to 759 kB, under the 800 kB tripwire US2 set. Proposal: no action.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:8ecf373ad68aa7b9c3b2c6d53e58c4a84c88eb44174cc4509e6ad1bdfb347c65 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
