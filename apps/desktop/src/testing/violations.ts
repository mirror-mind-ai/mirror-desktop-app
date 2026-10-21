// The harness's one recorder.
//
// Anything a UI test is not allowed to do is recorded here with what was
// attempted. Throwing would not be enough: the UI catches errors and shows
// them, so a check that only threw would be swallowed and the test would
// pass. The UI setup calls verify() after every test, so a recorded violation
// fails the test by name even when the UI caught the error.

export type ViolationKind =
  /** A request, a reply or an event that breaks the protocol. */
  | "protocol"
  /** The hello handshake the real host enforces (packages/host/src/server.ts). */
  | "handshake"
  /** A request the scripted world cannot answer, or a turn it never played. */
  | "unscripted"
  /** A socket to anything but the fake host's endpoint. */
  | "socket"
  /** fetch, XMLHttpRequest, EventSource, sendBeacon or a resource load. */
  | "network"
  /** A Tauri command nobody scripted. */
  | "ipc";

export interface Violation {
  readonly kind: ViolationKind;
  readonly detail: string;
}

const recorded: Violation[] = [];

export function record(kind: ViolationKind, detail: string): void {
  recorded.push({ kind, detail });
}

/** Drain and return what was recorded, for a harness test that expects it. */
export function take(): Violation[] {
  return recorded.splice(0);
}

/** Fail listing every violation, leaving the recorder empty for the next test. */
export function verify(): void {
  const found = take();
  if (found.length === 0) return;
  const lines = found.map((violation) => `  - ${violation.kind}: ${violation.detail}`);
  throw new Error(`The fake host recorded ${found.length} violation(s):\n${lines.join("\n")}`);
}
