# Technical Debt Ledger

Ariad Review records technical debt here when debt should be paid now or deferred.

| ID | Source Story | Location | Kind | Description | Impact | Recommendation | Navigator Decision | Status |
|----|--------------|----------|------|-------------|--------|----------------|--------------------|--------|
| TD-001 | [CV1.DS1.TS1](cv1-daily-use/cv1-ds1-the-conversation-shell/cv1-ds1-ts1-fake-host-and-ui-test-harness/index.md) | `apps/desktop/src/testing/turns.ts` (`checkShape`) | Test harness | The fixture loader requires an assistant message's `message_end.text` to equal its joined text deltas. That holds for a message with one text block. The host's projection joins several blocks with `"\n"`, and deltas never carry that separator. | A faithful fixture whose assistant message has several text blocks would be refused. | Relax the rule when the first such fixture is needed, for example by allowing `"\n"` between blocks. | Deferred, 2026-10-21 | Open |

## Deferred Debt Requirements

When debt is deferred, record the defer reason and revisit trigger.

- **TD-001.**
  - **Defer reason:** no fixture needs more than one text block per assistant
    message, and the real turn captured for TS1 had one.
  - **Revisit trigger:** the first fixture whose assistant message carries more
    than one text block, likely in CV1.DS1.US2 (transcript rendering).
