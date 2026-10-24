# Review — CV1.DS1.US2

## Status

Pending debt decision

## Debt Findings

- (1) Bundle: the JavaScript grew from 397 KB to 744 KB (gzip 119 KB to 225 KB): highlight.js's 37 common grammars about 173 KB (53 KB gzip), react-markdown with GFM about 158 KB (48 KB gzip). Vite now warns on every build. Proposal: pay now with a tripwire, the chunk-size warning limit set to 800 KB in vite.config.ts with its reason (the app loads from disk), so the gate is quiet and warns again at the next growth; alternatives: split the Markdown stack into its own chunk, or defer until CV3 ships updates over the network. (2) The window does not refuse a navigation: the transcript prevents a link's click and middle click, but nothing guards the webview itself (no navigation hook in the Rust shell, no context-menu handler), so WebKit's own Open Link on a right-click likely loads the page inside the app. Proposal: defer to the ledger as TD-003, a Rust change outside this story, revisited by the next story that changes the Rust shell and before CV1's week of daily use. (3) Duplication and a misleading name: textOf is written twice (Markdown.tsx and codeTree.ts), and a link's node is typed CodeTreeNode. Proposal: pay now, one TreeNode type and one textOf. (4) TD-001's revisit trigger names US2, which needed no fixture with several text blocks. Proposal: correct the trigger's text; the debt stays deferred.

## Debt Decision

pending

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- Navigator debt decision is required
<!-- ariad-seal sha256:80460f007c733639cb98a91488ef507e574a90f3255e51ad99499c00980fcda8 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
