# Review — CV1.DS1.TS2

## Status

Pending debt decision

## Debt Findings

- (1) Sign-in rows: each provider row is one flex line whose buttons never shrink, so in Monaco 'Anthropic (Claude Pro/Max)' leaves the name column about 230 px and 'signed in via oauth · stored' wraps over three lines, its check mark centered on the block (Navigator's captures, both themes). Proposed: rows may wrap, the name column taking a 16rem basis, so only rows with a wide OAuth button put their buttons on a second line. (2) Disabled accent buttons: disabled:bg-raised hides the fill on sign-in's raised cards, so Continue and the OAuth buttons read as plain text during a flow. Proposed: one disabled look on any ground, a hairline outline with dim text and no fill, for Send, the OAuth buttons and Continue. (3) The toasts' theme leans on sonner's internal --normal-* variables and its data-sonner-theme attribute; an upgrade that renames them would silently bring sonner's own palette back, and no test reads CSS. Proposed: a test that reads sonner's stylesheet for the names app.css overrides. (4) Pi's light muted is 4.32:1 on the light canvas and 4.47:1 on the light sidebar, under the 4.5:1 Pi's own docs keep for body text. Proposed: light muted two points darker in OKHSL, #636c71 (4.63:1 and 4.80:1), recorded in D15 as a departure that keeps Pi's rule. (5) No action: the toaster's 64 px top offset is the header's 48 px plus a gap, and says so beside it.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:ca8eb162ae7b5c63b582a918a36417f853f7fbf5976c65e9e50b9733d830f513 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
