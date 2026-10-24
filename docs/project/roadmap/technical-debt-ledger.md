# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | [CV1.DS1.TS1](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/index.md) | `apps/desktop/src/testing/turns.ts` (`checkShape`) | Test harness | The fixture loader requires an assistant message's `message_end.text` to equal its joined text deltas. That holds for a message with one text block. The host's projection joins several blocks with `"\n"`, and deltas never carry that separator. | A faithful fixture whose assistant message has several text blocks would be refused. | Relax the rule when the first such fixture is needed, for example by allowing `"\n"` between blocks. | Deferred, 2026-10-21 | Open |
| TD-002 | [CV1.DS1.US1](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us1-shell-and-journeys-sidebar/index.md) | `apps/desktop/src/SignIn.tsx` (its effect wrapping `client.onEvent`) | Design | The sign-in panel receives a sign-in flow's events by wrapping the connection's `onEvent` in an effect and restoring the previous handler on unmount. The conversations receive theirs through the store's `applyHostEvent`, which `connectToHost` installs. One connection's events reach the app in two ways. | A third listener has two patterns to choose from, and wrappers that unmount out of the order they mounted restore the wrong handler. The shell mounts one sign-in panel at a time, so this cannot happen today. | Route sign-in events through a store, as session events are, when sign-in is next reworked. | Deferred, 2026-10-22 | Open |
| TD-003 | [CV1.DS1.US2](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us2-transcript-rendering/index.md) | `apps/desktop/src-tauri/` (the main window); `apps/desktop/src/transcript/Markdown.tsx` (`Link`) | Security | The transcript keeps a link's target only for https and stops a click and a middle click from navigating the window, but the window itself accepts any navigation: nothing in the Rust shell refuses a URL outside the app, and nothing handles WebKit's own menu, whose Open Link on a right-click likely loads the page inside the app. | A link in a model's answer, which an attacker can shape, could put a remote page in the app's window, one that impersonates the app and asks for a key. IPC stays limited to the app's origin, so that page reaches no command. | Refuse in the Rust shell any navigation of the main window to a URL outside the app, and hand an https one to the opener instead. | Deferred, 2026-10-24 | Open |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001.**
  - **Defer reason:** no fixture needs more than one text block per assistant
    message, and the real turn captured for TS1 had one.
  - **Revisit trigger:** the first fixture whose assistant message carries more
    than one text block. CV1.DS1.US2, once the likely place, needed none: each
    of the six fixtures it added gives an assistant message one text block.
- **TD-002.**
  - **Defer reason:** sign-in works in the app and CV1 does not change it.
    The shell's tests mount its panel and list providers, but no test runs a
    flow (`auth.login`, `auth.event`, `auth.prompt`): the fake host does not
    script them, so rerouting its events now would change a path no test can
    follow.
  - **Revisit trigger:** the next story that changes sign-in (CV2 First Run's
    provider step), or a third part of the app that needs the host's events,
    whichever comes first.
- **TD-003.**
  - **Defer reason:** the guard is a change to the Rust shell, which
    CV1.DS1.US2 ruled out. The transcript already closes the paths it draws
    (a click, a middle click, any target but https), and the path left needs
    the person's right-click and a choice in WebKit's menu.
  - **Revisit trigger:** the next story that changes the Rust shell, and in
    any case before CV1's week of daily use begins.
