# Review — CV1.DS1.US3

## Status

Reviewed

## Debt Findings

- TD-004 amended: beside the stale sessions a reconnected UI would hold, the host's sessions.close() unsubscribes before it aborts, so a stop's agent_settled never reaches the UI; harmless while the goodbye close replaces the area. TD-002 extended for onClose. No new entry.

## Debt Decision

defer

## Defer Reason

Nothing respawns a dead host today, so no reconnection reaches the screen; what a conversation does with its session across hosts is answered by CV1.DS2.US1 and CV1.DS2.TS1 together, and settling it here would guess their answer

## Revisit Trigger

CV1.DS2.TS1, or the first change that lets the UI reach a second host in the app

## Missing Decision

- none
<!-- ariad-seal sha256:1159a93ec20d053728e3d67a275a7d59d847678890c7dc50a8e73b86ab4d9744 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
