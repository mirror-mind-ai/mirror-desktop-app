# Review — CV1.DS1.US2

## Status

Reviewed

## Debt Findings

- Paid (bf2cc48), by the Navigator's ruling: (1) the build's chunk-size warning, written for pages fetched over a network, fired on every gate since the Markdown and highlighting stack took the UI to 748 kB; the limit is now 800 kB with its reason in vite.config.ts, a tripwire that warns again at the next growth; (3) the text helper written twice and the link's node typed CodeTreeNode are one TreeNode type and one textOf in tree.ts. Corrected: (4) TD-001's revisit trigger no longer names US2, which needed no fixture with several text blocks; the debt stays deferred. Carried forward: (2) the window itself accepts any navigation, nothing in the Rust shell refusing a URL outside the app and WebKit's right-click Open Link left; TD-003 in the ledger, pointed to by D16.

## Debt Decision

defer

## Defer Reason

The guard is a change to the Rust shell, which US2 ruled out; the transcript already closes the paths it draws (a click, a middle click, any target but https), and the path left needs the person's right-click and a choice in WebKit's menu.

## Revisit Trigger

The next story that changes the Rust shell, and in any case before CV1's week of daily use begins (TD-003).

## Missing Decision

- none
<!-- ariad-seal sha256:9577bfe87fa623ebb8b6b89916b27567cdaa23150da42150d3013d5b99099481 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
