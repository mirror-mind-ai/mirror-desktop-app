// The harness's traffic log: what crossed each door, in order.
//
// The likeliest UI test failure breaks no rule: the expected text simply never
// renders, and Testing Library can only say "Unable to find an element". The
// fake host is the one part that knows what actually crossed the socket, so
// it writes it down here, and the UI setup prints it when a test fails. Fixtures
// and worlds are invented (see turns.ts), so the log only ever prints invented
// data.

const lines: string[] = [];

export function log(line: string): void {
  lines.push(line);
}

/** Drain the log: printed on failure, discarded otherwise, empty for the next test. */
export function takeLog(): string[] {
  return lines.splice(0);
}
