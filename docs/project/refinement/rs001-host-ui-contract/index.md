[< Refinement Workbench](../index.md)

# RS001 — Host–UI Contract

## Framing

The host and the UI speak one protocol, checked on both sides
([D3](../../decisions.md#d3--the-protocol-is-the-contract)), and the briefing
makes errors part of the surface ([invariants](../../briefing.md#invariants)).
The schemas cannot say what each side does when the other breaks the contract:
a message that does not parse, a request the host cannot read, a reply nobody
is waiting for. This story is the home for those gaps, found one at a time.

## Outcome

When the host and the UI disagree, the disagreement is named where a person or
a developer can see it, and nothing waits forever for a reply that will not
come. Each gap closes as one bounded Change Request, with the test that pins
it.

## Boundaries

- Message shapes change only the protocol's way: schema and test first (D3).
- Not the test harness's fake host; that is CV1.DS1.TS1.
- The canonical [Workbench index](../index.md) owns backlog status.

## Change Requests

- [CR001](cr001-a-message-that-breaks-the-protocol-is-dropped-silently.md) —
  A message that breaks the protocol is dropped silently, and the request
  behind it never settles.
