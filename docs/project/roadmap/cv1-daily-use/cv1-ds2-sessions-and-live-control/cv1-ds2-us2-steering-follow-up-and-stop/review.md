# Review — CV1.DS2.US2

## Status

Reviewed

## Debt Findings

- Paid (4d1ac92), by the Navigator's ruling: (2) the running turn's rules are conversations/liveTurn.ts, pure and tested as functions; the store sends and applies them, 524 lines, its behavior and tests unchanged. Carried forward: (1) Mirror loads twice in the host, the bundled package and the person's own, and since Pi builds a fresh before_agent_start event per handler both copies log every prompt and deliver Mirror's context; older than this story; CR003 in the Refinement Workbench under RS002 Host Runtime. (3) The fake host's stop written down from Pi 1.4.0's loop by hand; TD-006 in the ledger, for the next Pi upgrade. No action, by the Navigator's ruling: (4) a steer waits behind the prompt's preflight, 3.8 s measured, shown as Sending; (5) the registry's wiring proven only in the window, and a refused steer only in the store's tests; (6) the bundle at 763.9 kB, under the 800 kB tripwire.

## Debt Decision

defer

## Defer Reason

CR003 is older than US2, which changed neither how the host loads Mirror nor how Mirror logs, and its fix chooses between the host's loading and a Core-owned prerequisite, a decision of its own. TD-006 is faithful to Pi 1.4.0 today, checked against a real stop in the route; only a Pi change can make it wrong.

## Revisit Trigger

CR003 when the Navigator selects it in the Refinement Workbench; TD-006 at the next Pi upgrade, or a UI test about a stop that disagrees with the window.

## Missing Decision

- none
<!-- ariad-seal sha256:cfbd8803be5aef0c2369cc22a778bd957b781b1a1e476e57ecc8c55f40fb8523 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
