// What a running turn does with a message, and what Stop does to it
// (CV1.DS2.US2).
//
// Pi already queues. `AgentSession.prompt()` with a `streamingBehavior`
// queues the text while a run is active (a steer is delivered after the
// assistant's current turn, before its next request; a follow-up when the
// run would otherwise end) and starts a run when none is. It says what it did
// through `preflightResult`, once the prompt is accepted and never when it is
// rejected; Pi's RPC mode answers its own `prompt` command from that hook,
// and so does the host. The answer never waits for the run.
//
// Before asking Pi, the host refuses in its own words what Pi could not
// start (no model, no credential, compaction), because Pi's own messages for
// those carry paths and the protocol's errors never do. Anything else Pi
// rejects before its preflight goes back as Pi's failure, which the server
// names `internal_failure` with the words on stderr.
//
// Pi's `abort()` leaves the queue behind, and the next run would deliver it
// unseen: terminal Pi's Escape withdraws the queue into the editor first. A
// stop here withdraws it before the abort and again once the run has
// stopped, since a steer still in its input handlers when Stop lands queues
// after the first clear; and it keeps out of what it withdrew any message
// the loop had already taken, whose echo arrives while the stop lands: that
// one is in the transcript.
//
// Pure over the parts of a Pi session it reads, so it is proven without Pi;
// sessions.ts applies it to the real one.

import type { PromptDisposition, QueuedMessages, SessionEvent, StreamingBehavior } from "@mirror-desktop/protocol";

import { SessionBusyError } from "./sessionPolicy.ts";

/** A prompt the host refused before Pi took it, in the host's own words. */
export class PromptRefusedError extends Error {
  override readonly name = "PromptRefusedError";
}

/** What accepting a prompt reads of an open Pi session; Pi's AgentSession is one. */
export interface PromptTarget {
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly model: { readonly provider: string } | undefined;
  prompt(
    text: string,
    options: {
      streamingBehavior?: StreamingBehavior;
      preflightResult?: (disposition: "started" | "queued" | "handled") => void;
    },
  ): Promise<void>;
}

export interface Acceptance {
  /** Whether the model's provider has a credential Pi can use, as Pi checks it before a run. */
  hasCredential(provider: string): Promise<boolean>;
  /** Pi accepted the prompt and the run failed after: an event, since the answer was already given. */
  onLateFailure(cause: unknown): void;
}

/**
 * Hand `text` to Pi and answer with what Pi did with it, as soon as Pi says:
 * started, queued, handled, or deferred when Pi returned without saying,
 * which it does only for a prompt it put after the turn that was settling.
 */
export async function acceptPrompt(
  session: PromptTarget,
  text: string,
  behavior: StreamingBehavior | undefined,
  acceptance: Acceptance,
): Promise<PromptDisposition> {
  if (session.isStreaming) {
    if (!behavior) throw new SessionBusyError("The session is still answering.");
  } else {
    // What Pi checks before it starts a run, said in the host's words. A
    // queued message starts no run, and Pi checks none of it then.
    if (session.isCompacting) throw new PromptRefusedError("Pi is compacting the session; try again in a moment.");
    const model = session.model;
    if (!model) throw new PromptRefusedError("No model is selected for this session.");
    if (!(await acceptance.hasCredential(model.provider))) {
      throw new PromptRefusedError(`No credential for ${model.provider}: sign in first.`);
    }
  }
  return new Promise<PromptDisposition>((resolve, reject) => {
    let answered = false;
    const answer = (disposition: PromptDisposition) => {
      if (answered) return;
      answered = true;
      resolve(disposition);
    };
    session
      .prompt(text, { ...(behavior ? { streamingBehavior: behavior } : {}), preflightResult: answer })
      .then(
        () => answer("deferred"),
        (cause: unknown) => {
          if (answered) {
            acceptance.onLateFailure(cause);
            return;
          }
          answered = true;
          // A run that began between the host's check and Pi's: busy, as the host says it.
          reject(!behavior && session.isStreaming ? new SessionBusyError("The session is still answering.") : cause);
        },
      );
  });
}

/** What a stop reads of an open Pi session; Pi's AgentSession is one. */
export interface StopTarget {
  clearQueue(): QueuedMessages;
  abort(): Promise<void>;
}

/** Watch the session's events as the host projects them; returns the unwatch. */
export type Observe = (listener: (event: SessionEvent) => void) => () => void;

/**
 * Stop the session's turn and answer with the queued messages withdrawn from
 * it, steering first, as Pi keeps them: none of them reaches the next turn.
 */
export async function stopTurn(session: StopTarget, observe: Observe): Promise<QueuedMessages> {
  const delivered: string[] = [];
  let settled: () => void = () => {};
  const stoppedRun = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const unwatch = observe((event) => {
    if (event.type === "message_end" && event.role === "user") delivered.push(event.text);
    if (event.type === "agent_settled") settled();
  });
  try {
    const before = session.clearQueue();
    const aborting = session.abort();
    // abort() resolves once Pi is idle, and a prompt Pi deferred during the
    // settle runs a whole new run before that. The stopped run settling is
    // the moment the stop is done; a failure of the wait after it has
    // nothing left to report.
    aborting.catch(() => undefined);
    await Promise.race([aborting, stoppedRun]);
    const after = session.clearQueue();
    return withoutDelivered(
      { steering: [...before.steering, ...after.steering], followUp: [...before.followUp, ...after.followUp] },
      delivered,
    );
  } finally {
    unwatch();
  }
}

/** `withdrawn` without the messages Pi delivered: the first equal text of each, steering first. */
function withoutDelivered(withdrawn: QueuedMessages, delivered: readonly string[]): QueuedMessages {
  const steering = [...withdrawn.steering];
  const followUp = [...withdrawn.followUp];
  for (const text of delivered) {
    const inSteering = steering.indexOf(text);
    if (inSteering !== -1) {
      steering.splice(inSteering, 1);
      continue;
    }
    const inFollowUp = followUp.indexOf(text);
    if (inFollowUp !== -1) followUp.splice(inFollowUp, 1);
  }
  return { steering, followUp };
}
