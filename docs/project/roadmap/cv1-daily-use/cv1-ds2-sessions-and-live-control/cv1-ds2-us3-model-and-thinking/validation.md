# Validation — CV1.DS2.US3

## Status

Passed

## Automated Checks

- npm run typecheck (clean); npm test (508 passed in 45 files); npm run build; git diff --check; story tests per test-guide.md; desktop project shuffled with seeds 1-3 (406 passed each); the parity test runs Pi's own createAgentSession over every branch of the start rule; the clamp pinned to pi-ai's over 1,599 models; eight mutation checks caught; the bundle stages pi-ai 1.4.0 and the built app starts and quits cleanly; the real host refuses a 0.6.0 client and answers a Journey's defaults as Pi's settings and its newest session's resumes as the file's own; the real turn on automation opened on anthropic/claude-haiku-4-5 at low and the file recorded both

Checks status: passed

## E2E

Decision: required

Evidence: The Navigator walked the 11-step route on automation, 2026-11-12, with the session files read by grep and Pi's settings diffed: the newest file's own model and level before any send; New session on Pi's default, claude-sonnet-5-5 at medium; sonnet-5-5's thinking list offering low to max with Pi's descriptions, medium marked default; the model list opening on its filter and narrowing by 'sonnet' and 'luna' across Anthropic, OpenAI Codex and OpenRouter; haiku at low held, then the file opened on haiku and low; gpt-6-luna at off; sonnet-5-5 picked on the open session, the file recording sonnet, Pi's interim medium, then low; during a multi-tool run, high then claude-opus-5-5, the file recording both, the run uninterrupted; the older haiku file resumed on sonnet at high, the answer naming claude-sonnet-5-5; the header after relaunch as the file ended; pi -r's footer (anthropic) claude-sonnet-5-5 • high; ~/.pi/agent/settings.json unchanged, and no project settings file

## Navigator Validation

Route: test-guide.md, Navigator Validation, as corrected for zsh: the witness function reads a session file's last model and thinking entries; 11 steps on automation

Navigator accepted: yes

Expected observation: The header always says what the next answer runs on; only the model's levels are offered, in Pi's words; the model list filters; a held pick is sent with the first message; a change on the open session and during a run lands in the session file and the next request runs on it, the run uninterrupted; Escape with a list open never stops a turn; Pi's settings are unchanged

Pass condition: Every observation in the 11 steps holds

Fail condition: Any observation fails; or a pick before a send writes anything; or a change is missing from the session file; or a change during a run stops the turn; or Escape with a list open stops a turn; or Pi's settings change

## Missing Evidence

- none
<!-- ariad-seal sha256:466d8f04b1a46016a4322148727bdf9eb090c6b11cdf710317bcffb2a6a2050c — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
