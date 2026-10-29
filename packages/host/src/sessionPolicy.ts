// What an open must do first, and what it must refuse.
//
// A Journey has one open session at a time, and the host keeps it so: an
// open for a Journey closes the session the Journey had open, in the same
// request (CV1.DS2.US1, ruling R1). The UI never sequences a close and an
// open, and picking a session in the UI stays a look: the send that opens
// the next session is what closes the last. An open is refused while the
// session it would close is answering, so a turn is never cut by a send.
//
// And a session file is open once: two conversations would share one Pi
// session, its events routed to whichever the UI finds first, and two
// writers would append to one file.
//
// Pure, so the rules are proven without Pi; sessions.ts applies them.

import { SessionFileRefusedError } from "./sessionIndex.ts";

export class SessionBusyError extends Error {
  override readonly name = "SessionBusyError";
}

/** An open session, as the rules see it. */
export interface OpenSessionFacts {
  id: string;
  journey?: string;
  /** Pi's session file. */
  file: string;
  streaming: boolean;
}

export interface OpenRequestFacts {
  journey?: string;
  /** The session file to resume, already checked to be one of the Journey's. */
  file?: string;
}

export interface OpenPlan {
  /** The sessions to close before opening, in order. */
  close: string[];
}

/** The sessions to close before this open; throws when the open must not happen. */
export function planOpen(open: readonly OpenSessionFacts[], request: OpenRequestFacts): OpenPlan {
  const previous = request.journey === undefined ? [] : open.filter((session) => session.journey === request.journey);
  if (previous.some((session) => session.streaming)) {
    throw new SessionBusyError("The Journey's session is still answering: stop it or let it finish first.");
  }
  if (request.file !== undefined && open.some((session) => session.file === request.file && !previous.includes(session))) {
    throw new SessionFileRefusedError("That session is already open in this app.");
  }
  return { close: previous.map((session) => session.id) };
}
