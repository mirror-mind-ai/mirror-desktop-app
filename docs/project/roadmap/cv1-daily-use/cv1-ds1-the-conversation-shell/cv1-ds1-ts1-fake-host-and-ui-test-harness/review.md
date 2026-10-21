# Review — CV1.DS1.TS1

## Status

Pending debt decision

## Debt Findings

- 1) networkGuard.ts installs happy-dom's loader interceptor through an untyped settings API, silently skips it if that API moves, and no test pins it (it works today: a fetch captured before the guard is blocked and recorded). Recommended: pay now, with one test and a loud failure when the API is missing. 2) The fixture loader's rule that an assistant message ends with its joined text deltas assumes one text block per message, as documented in turns.ts. Recommended: defer to the ledger, revisit at the first fixture whose assistant message carries more than one text block.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:7e61e3e80f0f9cff6b11530ff1b7b007897bbc076daf94f109f2d1573e533cb4 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
