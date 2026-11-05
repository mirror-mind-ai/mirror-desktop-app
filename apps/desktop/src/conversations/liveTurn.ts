// The running turn's rules (CV1.DS2.US2): what Pi's events do to a
// conversation's live state, what goes back in the draft and how, and what
// a lost host takes along. Pure, so each rule is proven without a store; the
// store (store.ts) applies them, and draws the rows.
//
// A message sent into a running turn is listed as sending until Pi answers,
// then shown as Pi's queue says; a message Pi deferred to after the settling
// turn is in no queue of Pi's, so it stays listed until its echo or until
// the run it started settles. The store's own prompt is drawn when sent, and
// its echo swallowed. Running follows Pi's own word as well as the store's
// sends. Whatever goes back in the draft goes by terminal Pi's merge, which
// never discards what was typed.

import type { QueuedMessages, SessionEvent, StreamingBehavior } from "@mirror-desktop/protocol";

/** A message sent into a running turn that Pi has not taken into its queue yet. */
export interface Sending {
  readonly text: string;
  readonly behavior: StreamingBehavior;
  /** Deferred by Pi: waiting for the run it will start, or in it. */
  readonly deferred?: "waiting" | "running";
}

/** A conversation's running-turn state. */
export interface LiveTurn {
  /** A turn is under way: the store sent a prompt, or Pi said a run began, and it has not settled. */
  readonly running: boolean;
  /** Pi's own word that a run is going: an agent_start not followed by agent_settled yet. */
  readonly piRunning: boolean;
  /** The messages Pi holds for the running turn, as its last queue_update said, steering first. */
  readonly queue: QueuedMessages;
  readonly sending: readonly Sending[];
  /** The store's own prompt is on its way to Pi: the next user message Pi echoes is that one, already drawn. */
  readonly awaitingEcho: boolean;
  readonly draft: string;
}

export const NOTHING_QUEUED: QueuedMessages = { steering: [], followUp: [] };

/** A conversation with no turn under way. */
export const QUIET: Omit<LiveTurn, "draft"> = { running: false, piRunning: false, queue: NOTHING_QUEUED, sending: [], awaitingEcho: false };

/**
 * Terminal Pi's merge for whatever goes back in the draft: the returned
 * texts, then what the draft holds, each blank one dropped, joined by blank
 * lines. Nothing typed is ever discarded.
 */
export function returnToDraft(returned: readonly string[], draft: string): string {
  return [...returned, draft].filter((text) => text.trim() !== "").join("\n\n");
}

/**
 * What one of Pi's events changes in the running turn, and whether the
 * transcript draws it: every event is drawn but the echo of the store's own
 * prompt, which was drawn when it was sent.
 */
export function afterEvent(turn: LiveTurn, event: SessionEvent): { readonly changes: Partial<LiveTurn>; readonly draws: boolean } {
  switch (event.type) {
    case "agent_start":
      // A run begun by anything, a send or not: a deferred message's run is now the one it waits in.
      return {
        changes: {
          running: true,
          piRunning: true,
          sending: turn.sending.map((sending) => (sending.deferred === "waiting" ? { ...sending, deferred: "running" } : sending)),
        },
        draws: true,
      };
    case "agent_settled":
      return {
        changes: {
          running: false,
          piRunning: false,
          awaitingEcho: false,
          // A deferred message its run never echoed (Pi delivered it in other words) is not sending any more.
          sending: turn.sending.filter((sending) => sending.deferred !== "running"),
        },
        draws: true,
      };
    case "queue_update":
      return { changes: { queue: { steering: event.steering, followUp: event.followUp } }, draws: false };
    case "message_end":
      if (event.role !== "user") break;
      if (turn.awaitingEcho) return { changes: { awaitingEcho: false }, draws: false };
      return { changes: { sending: withoutFirst(turn.sending, event.text) }, draws: true };
    default:
      break;
  }
  return { changes: {}, draws: true };
}

/** The sending list once Pi has answered for `sent`: listed on only if Pi deferred it. */
export function answered(sending: readonly Sending[], sent: Sending, disposition: "started" | "queued" | "handled" | "deferred"): readonly Sending[] {
  return disposition === "deferred"
    ? sending.map((other) => (other === sent ? { ...other, deferred: "waiting" } : other))
    : sending.filter((other) => other !== sent);
}

/**
 * What a lost host takes from the running turn: the queue and what was
 * sending die with it, so both go back in the draft, once each, before what
 * was typed. Undefined when the turn held nothing for the host.
 */
export function lostWithTheHost(turn: LiveTurn): Partial<LiveTurn> | undefined {
  const held = [...turn.queue.steering, ...turn.queue.followUp, ...turn.sending.map((sending) => sending.text)];
  const returned = held.filter((text, index) => held.indexOf(text) === index);
  if (returned.length === 0 && !turn.awaitingEcho && !turn.piRunning) return undefined;
  return {
    queue: NOTHING_QUEUED,
    sending: [],
    awaitingEcho: false,
    piRunning: false,
    draft: returned.length > 0 ? returnToDraft(returned, turn.draft) : turn.draft,
  };
}

/** `sending` without the first message whose text is `text`: Pi has delivered it. */
function withoutFirst(sending: readonly Sending[], text: string): readonly Sending[] {
  const at = sending.findIndex((message) => message.text === text);
  return at === -1 ? sending : [...sending.slice(0, at), ...sending.slice(at + 1)];
}
