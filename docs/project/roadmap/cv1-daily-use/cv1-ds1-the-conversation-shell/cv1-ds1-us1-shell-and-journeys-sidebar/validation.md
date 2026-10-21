# Validation — CV1.DS1.US1

## Status

Blocked

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 146 tests (12 node, 134 desktop); cargo check green. Collection by name: every BASE test kept or moved by name. Eight red runs recorded; seeds 20261022, 3 and 7 and 20 consecutive desktop runs green. The tree test's order is the core's own listJourneyOptions output.

Checks status: passed

## E2E

Decision: required

Evidence: Pending: the Navigator runs the real app (npm run dev) on two Journeys they name, steps 1-7 of the US1 test guide; step 6 (host unreachable) is not reproducible by hand and is proven against the fake host.

## Navigator Validation

Route: The seven steps in the US1 test guide, in the real app on two named Journeys: the sidebar matches mirror journeys; picking writes nothing (mirror conversations unchanged); the first send opens where the header says; switching keeps draft, stream and the working marker, each prompt logged under its own Journey; a Journey without a project path names set-path and Refresh; the console is gone.

Navigator accepted: no

Expected observation: The sidebar nests and orders active Journeys as mirror journeys does; a pick writes nothing; the first send opens one session and the header shows its path, model and thinking; switching keeps each conversation, its draft and its stream, marking the working Journey; one Mirror conversation per Journey, each with its own prompt; the traffic lights clear the sidebar and the window drags by its top.

Pass condition: Every observation in the US1 test guide holds.

Fail condition: Any observation does not hold.

## Missing Evidence

- Navigator validation has not been accepted
<!-- ariad-seal sha256:559c22783919f7e3bd3bda047f82908441970c9e039c4589a868c8cba20d4088 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
