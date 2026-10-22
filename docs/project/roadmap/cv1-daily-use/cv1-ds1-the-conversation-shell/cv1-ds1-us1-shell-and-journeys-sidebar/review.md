# Review — CV1.DS1.US1

## Status

Reviewed

## Debt Findings

- Paid (b3b6da9): the fixture-oracle lines duplicated in two UI test files, now assistantTextOf() in the harness, which fails on a turn with no answer instead of inventing one; and the conversation area's six-way nested conditional, now ConversationArea with ordered early returns, its sixteen UI tests passing unchanged. Carried forward: TD-002 in the technical debt ledger, sign-in's events arriving by wrapping the connection's onEvent while the conversations' arrive through the store. No action: the store's send() is long but reads top to bottom, and splitting it would scatter the undo of a failed send. Outside US1: CR002, captured in the Refinement Workbench under RS002 Host Runtime.

## Debt Decision

defer

## Defer Reason

Sign-in works in the app and CV1 does not change it; no test runs a sign-in flow, because the fake host does not script them, so rerouting its events now would change a path no test can follow.

## Revisit Trigger

The next story that changes sign-in (CV2 First Run's provider step), or a third part of the app that needs the host's events, whichever comes first.

## Missing Decision

- none
<!-- ariad-seal sha256:c70224f4e807a51dcfc33c3619bd4b7192b0b9fed22b9bbf3c4405150cd142db — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
