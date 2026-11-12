# Review — CV1.DS2.US3

## Status

Reviewed

## Debt Findings

- Paid, by the Navigator's ruling: (1) the desktop listed 401 OpenRouter models through a key only Mirror's configuration puts in the host's environment, which terminal Pi lacks, so a session moved to one would not resume on it in pi -r; the list now holds only providers whose credential Pi reports as its own, stored in auth.json or from its models.json, and the host refuses a pick of any other (fd64834); on the Navigator's machine 426 models became 26. (2) A busy control lost the keyboard focus, disabled while a change waited; busy is now aria-disabled on a button that keeps the focus, the two controls share it, and when a pick takes effect is a pure rule in headerChoice.ts (3336bca). Carried forward: (3) the fake host's model rules written by hand from the real host's, which the parity test holds to Pi; TD-007 in the ledger. No action, by the Navigator's ruling: (4) the start rule, the clamp and Pi's level descriptions copied from Pi 1.4.0, the first two checked against Pi by tests that fail on drift, while terminal Pi is already 1.5.2; (5) a mid-run model change's window, in which Pi's setModel runs on its switch-rule level until the host sets the chosen one, the file keeping the interim entry, which only a setModel that takes the level can close, a candidate for Pi; (6) the filter matching words where Pi's /model is fuzzy, and the store holding the choice actions beside their pure rules. Measured: the store 524 to 650 lines, the fake host 864 to 1,028, the UI bundle 774.6 kB, under the 800 kB tripwire.

## Debt Decision

defer

## Defer Reason

TD-007's rules match the real host's today, whose own rule the parity test holds to Pi 1.4.0, and the Navigator's route saw the real header agree with each session file; sharing one rule would put the host's code, which reads Pi's model catalog, into the UI's test environment.

## Revisit Trigger

TD-007 when the start rule in packages/host/src/modelChoice.ts changes, or at the next Pi upgrade, whichever comes first.

## Missing Decision

- none
<!-- ariad-seal sha256:3138e5ce98fb6f3cac918ea5c751c89d469408f3ed37a5c2e387ebae76846e2f — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
