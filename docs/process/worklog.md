# Worklog

Meaningful milestones, newest last.

- **2026-10-20** — Repository created as the second body of Mirror Desktop; scaffold of protocol, host and shell ([8e39341](https://github.com/mirror-mind-ai/mirror-desktop-app/commit/8e39341)).
- **2026-10-20** — Spike 1: a real turn through the host, logged by Mirror's own extension ([spike](../project/spikes/spike-1-host-prototype.md)).
- **2026-10-20** — Spike 2: a signed bundle that runs with no Node, Pi or Mirror on the machine ([spike](../project/spikes/spike-2-clean-machine-bundle.md)).
- **2026-10-20** — Spike 3: provider sign-in from inside the app ([spike](../project/spikes/spike-3-in-app-provider-login.md)).
- **2026-10-20** — Spike 4: a session opened for a Journey is bound to it by name ([spike](../project/spikes/spike-4-journey-binding.md)).
- **2026-10-20** — Ariad adopted for the journey; CV0 recorded done, CV1 Daily Use authored with two Delivery Stories; decisions D1–D12 recorded.
- **2026-10-21** — Refinement Workbench opened and development guide written, before CV1's first story is planned ([guide](development-guide.md)).
- **2026-10-21** — CV1.DS1.TS1 done: the UI test harness. A fake host replaces the UI's two doors, every desktop test runs in happy-dom with no Pi, model or network, and the first UI test proves the console streaming a turn; the built app stays byte-identical ([story](../project/roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/index.md)).
- **2026-10-22** — CV1.DS1.US1 done: the shell replaces the spike console. Active Journeys in a sidebar nested as Mirror nests them; picking a Journey writes nothing and its first send opens the session (D14); each conversation keeps its draft and its stream; every empty and failure state names its next step. Validated in the real app on two Journeys ([story](../project/roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us1-shell-and-journeys-sidebar/index.md)).
- **2026-10-24** — CV1.DS1.TS2 done: Mirror's look, carried from Pi (D15). Monaco throughout and Pi's own palettes in a dark and a light theme; the appearance follows the system until chosen, is applied before the first render and survives a relaunch of the built app; `app.css` is the whole vocabulary and a test holds every class to it. Validated in the real app beside Pi; Pi's Markdown colors were ruled to US2 ([story](../project/roadmap/cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts2-mirrors-tokens-and-theme/index.md)).
