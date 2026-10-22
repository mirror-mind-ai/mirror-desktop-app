# Validation — CV1.DS1.US1

## Status

Passed

## Automated Checks

- npm run typecheck && npm test && npm run build && git diff --check: green, 146 tests (12 node, 134 desktop); cargo check green. Collection by name: every BASE test kept or moved by name. Eight red runs recorded; seeds 20261022, 3 and 7 and 20 consecutive desktop runs green. The tree test's order is the core's own listJourneyOptions output.

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator ran the real app (npm run dev) on Automation and Admin on 2026-10-22, with captures: the sidebar matched mirror journeys; a pick wrote nothing; Automation's first send opened ~/dev/workspace/automation (anthropic/claude-fable-5, thinking max), recorded as 5566fc37 [automation]; Admin's count recorded as fbdbb356 [admin] while Automation showed its spinner; Campos Houses showed set-path and Refresh with no composer. Host unreachable not manually verified. Outside US1: Homebrew replaced Node during the run, so the host's bind failed with ENOENT, shown in place as a diagnostic row; conversations were still logged under the right Journeys.

## Navigator Validation

Route: The seven steps in the US1 test guide, in the real app on two named Journeys: the sidebar matches mirror journeys; picking writes nothing (mirror conversations unchanged); the first send opens where the header says; switching keeps draft, stream and the working marker, each prompt logged under its own Journey; a Journey without a project path names set-path and Refresh; the console is gone.

Navigator accepted: yes

Expected observation: The sidebar nests and orders active Journeys as mirror journeys does; a pick writes nothing; the first send opens one session and the header shows its path, model and thinking; switching keeps each conversation, its draft and its stream, marking the working Journey; one Mirror conversation per Journey, each with its own prompt; the traffic lights clear the sidebar and the window drags by its top.

Pass condition: Every observation in the US1 test guide holds.

Fail condition: Any observation does not hold.

## Missing Evidence

- none
<!-- ariad-seal sha256:dedb95487aae1cf5aa0157242fad46e38a9ebc101a1d975acc00930f8226faaf — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
