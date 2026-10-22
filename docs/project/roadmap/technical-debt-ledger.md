# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | [CV1.DS1.TS1](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/index.md) | `apps/desktop/src/testing/turns.ts` (`checkShape`) | Test harness | The fixture loader requires an assistant message's `message_end.text` to equal its joined text deltas. That holds for a message with one text block. The host's projection joins several blocks with `"\n"`, and deltas never carry that separator. | A faithful fixture whose assistant message has several text blocks would be refused. | Relax the rule when the first such fixture is needed, for example by allowing `"\n"` between blocks. | Deferred, 2026-10-21 | Open |
| TD-002 | [CV1.DS1.US1](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-us1-shell-and-journeys-sidebar/index.md) | `apps/desktop/src/SignIn.tsx` (its effect wrapping `client.onEvent`) | Design | The sign-in panel receives a sign-in flow's events by wrapping the connection's `onEvent` in an effect and restoring the previous handler on unmount. The conversations receive theirs through the store's `applyHostEvent`, which `connectToHost` installs. One connection's events reach the app in two ways. | A third listener has two patterns to choose from, and wrappers that unmount out of the order they mounted restore the wrong handler. The shell mounts one sign-in panel at a time, so this cannot happen today. | Route sign-in events through a store, as session events are, when sign-in is next reworked. | Deferred, 2026-10-22 | Open |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001.**
  - **Defer reason:** no fixture needs more than one text block per assistant
    message, and the real turn captured for TS1 had one.
  - **Revisit trigger:** the first fixture whose assistant message carries more
    than one text block, likely in CV1.DS1.US2 (transcript rendering).
- **TD-002.**
  - **Defer reason:** sign-in works in the app and CV1 does not change it.
    The shell's tests mount its panel and list providers, but no test runs a
    flow (`auth.login`, `auth.event`, `auth.prompt`): the fake host does not
    script them, so rerouting its events now would change a path no test can
    follow.
  - **Revisit trigger:** the next story that changes sign-in (CV2 First Run's
    provider step), or a third part of the app that needs the host's events,
    whichever comes first.
