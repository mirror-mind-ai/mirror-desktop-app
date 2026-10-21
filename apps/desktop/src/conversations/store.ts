// The conversations: one per Journey the person has picked, for this run of
// the app, and which one is on screen.
//
// Picking a Journey only shows it. Its session is opened by the first send,
// because a send is the person's intent to converse, and opening a session
// writes: the host starts Pi in the Journey's project path and binds a Mirror
// conversation to it. Looking around the sidebar therefore leaves nothing
// behind in Mirror. Once open, the session stays open until the app quits.
//
// Every conversation keeps its own draft, transcript and running turn, and
// host events are routed to the conversation whose session they name, so a
// Journey streaming in the background keeps its stream while another one is
// on screen.

import type { HostEvent, HostResultBody } from "@mirror-desktop/protocol";
import { create } from "zustand";

import { failureOf, type HostConnection } from "../host/client.ts";
import { registerStore } from "../stores/registry.ts";
import { reduceRows, type Row } from "./transcript.ts";

export interface Session {
  readonly id: string;
  /** Where the host says the session runs, which is what the header shows once it is open. */
  readonly cwd: string;
  /** `provider/id`, when the session has a model. */
  readonly model?: string;
  readonly thinkingLevel: string;
}

export type ConversationStatus =
  /** Picked, with no session yet. */
  | "idle"
  /** The first send is opening the session. */
  | "opening"
  | "open"
  /** The last open failed; `failure` says why, and the next send opens again. */
  | "failed";

export interface Conversation {
  readonly status: ConversationStatus;
  readonly draft: string;
  readonly rows: Row[];
  /** A prompt was sent and its turn has not settled. */
  readonly running: boolean;
  readonly session?: Session;
  readonly failure?: string;
}

export interface ConversationsState {
  /** The Journey on screen. */
  readonly current: string | null;
  readonly entries: Readonly<Record<string, Conversation>>;
}

const initialState: ConversationsState = { current: null, entries: {} };
const IDLE: Conversation = { status: "idle", draft: "", rows: [], running: false };

/**
 * Bumped by every reset. An action that was waiting on the host when the
 * stores were reset (between two tests) finds it changed and writes nothing.
 */
let epoch = 0;

export const useConversations = create<ConversationsState>()(() => initialState);
registerStore("conversations", useConversations, initialState, () => {
  epoch += 1;
});

/** Whether the Journey is busy on the person's behalf: opening its session for a message, or answering one. */
export function isWorking(conversation: Conversation | undefined): boolean {
  return conversation !== undefined && (conversation.status === "opening" || conversation.running);
}

/** Show `journeyId`, keeping every other conversation as it is. */
export function selectJourney(journeyId: string): void {
  useConversations.setState((state) => ({
    current: journeyId,
    entries: state.entries[journeyId] ? state.entries : { ...state.entries, [journeyId]: IDLE },
  }));
}

export function setDraft(journeyId: string, draft: string): void {
  update(journeyId, (conversation) => ({ ...conversation, draft }));
}

/**
 * Send the Journey's draft: open its session first if it has none, then
 * prompt it. The message shows at once. Refused, with the draft kept, while
 * the session opens or a turn runs.
 *
 * A failed open is a standing state, shown in the conversation; the message
 * goes back into the draft, so sending again retries. A refused prompt is a
 * failed action: it is rolled back the same way, and the returned promise
 * rejects so the composer can say why.
 */
export async function send(client: HostConnection, journeyId: string): Promise<void> {
  const mine = epoch;
  const before = entryOf(journeyId);
  const text = before.draft.trim();
  if (!text || before.status === "opening" || before.running) return;

  const sent: Row = { kind: "user", text };
  update(journeyId, (conversation) => ({ ...withoutFailure(conversation), draft: "", rows: [...conversation.rows, sent] }));
  /** Take the message back: out of the transcript, into the draft unless something new was typed meanwhile. */
  const takeBack = (conversation: Conversation): Conversation => ({
    ...conversation,
    rows: conversation.rows.filter((row) => row !== sent),
    draft: conversation.draft === "" ? before.draft : conversation.draft,
  });

  let session = before.status === "open" ? before.session : undefined;
  if (!session) {
    update(journeyId, (conversation) => ({ ...conversation, status: "opening" }));
    let opened: HostResultBody;
    try {
      opened = await client.request({ type: "session.open", journey: journeyId });
      if (opened.type !== "session.open") throw new Error("The host answered session.open with something else.");
    } catch (error) {
      if (mine !== epoch) return;
      update(journeyId, (conversation) => ({ ...takeBack(conversation), status: "failed", failure: failureOf(error).message }));
      return;
    }
    if (mine !== epoch) return;
    const openedSession = sessionOf(opened);
    const diagnostics: Row[] = opened.diagnostics.map((text) => ({ kind: "diagnostic", text }));
    session = openedSession;
    update(journeyId, (conversation) => ({
      ...conversation,
      status: "open",
      session: openedSession,
      rows: [...diagnostics, ...conversation.rows],
    }));
  }

  // Running before the host answers, so the turn's first events, which can
  // arrive with the answer, find their conversation already running.
  update(journeyId, (conversation) => ({ ...conversation, running: true }));
  try {
    await client.request({ type: "session.prompt", sessionId: session.id, text });
  } catch (error) {
    if (mine !== epoch) return;
    update(journeyId, (conversation) => ({ ...takeBack(conversation), running: false }));
    throw error;
  }
}

/**
 * Ask the host to stop the Journey's running turn. What stopping does to the
 * turn, and a host that refuses, are CV1.DS2's; here the request only has to
 * reach the right session.
 */
export async function abort(client: HostConnection, journeyId: string): Promise<void> {
  const conversation = useConversations.getState().entries[journeyId];
  if (!conversation?.session || !conversation.running) return;
  await client.request({ type: "session.abort", sessionId: conversation.session.id }).catch(() => undefined);
}

/** Fold a host event into the conversation whose session it names. */
export function applyHostEvent(event: HostEvent): void {
  if (event.type !== "session.event" && event.type !== "session.extension_error") return;
  const journeyId = journeyOfSession(event.sessionId);
  // An event for a session no conversation knows is dropped. In this app that
  // can only be an extension failing while its session opens, before the
  // open's answer names the session: the console lost those too, and the
  // answer's diagnostics carry what failed to load.
  if (journeyId === undefined) return;
  if (event.type === "session.extension_error") {
    const notice: Row = { kind: "notice", text: `${event.extension} failed on ${event.event}: ${event.message}` };
    update(journeyId, (conversation) => ({ ...conversation, rows: [...conversation.rows, notice] }));
    return;
  }
  const settled = event.event.type === "agent_settled";
  update(journeyId, (conversation) => ({
    ...conversation,
    rows: reduceRows(conversation.rows, event.event),
    ...(settled ? { running: false } : {}),
  }));
}

function entryOf(journeyId: string): Conversation {
  return useConversations.getState().entries[journeyId] ?? IDLE;
}

function update(journeyId: string, change: (conversation: Conversation) => Conversation): void {
  useConversations.setState((state) => ({
    entries: { ...state.entries, [journeyId]: change(state.entries[journeyId] ?? IDLE) },
  }));
}

function journeyOfSession(sessionId: string): string | undefined {
  const entries = useConversations.getState().entries;
  return Object.keys(entries).find((journeyId) => entries[journeyId]?.session?.id === sessionId);
}

function sessionOf(opened: Extract<HostResultBody, { type: "session.open" }>): Session {
  return {
    id: opened.sessionId,
    cwd: opened.cwd,
    ...(opened.model ? { model: `${opened.model.provider}/${opened.model.id}` } : {}),
    thinkingLevel: opened.thinkingLevel,
  };
}

function withoutFailure(conversation: Conversation): Conversation {
  const { failure: _cleared, ...rest } = conversation;
  return rest;
}
