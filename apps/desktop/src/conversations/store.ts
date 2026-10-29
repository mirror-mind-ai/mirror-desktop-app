// The conversations: one per Journey the person has picked, for this run of
// the app, and which one is on screen.
//
// A Journey's conversations are its Pi sessions, many of them (D7). Picking a
// Journey shows its most recent session, read from the session file: the
// host lists the Journey's sessions and reads one, and opens nothing.
// Picking another session from the list, or "New session", is a look too.
// The first send is what acts, because a send is the person's intent to
// converse, and opening a session writes: the host starts Pi in the Journey's
// project path, resuming the shown session's file or starting a new one, and
// binds a Mirror conversation to it. Looking around therefore leaves nothing
// behind in Mirror (D14). The host keeps one open session per Journey, so a
// send that opens another closes the one before; nothing here closes one.
//
// Every conversation keeps its own draft, transcript and running turn, and
// host events are routed to the conversation whose session they name, so a
// Journey streaming in the background keeps its stream while another one is
// on screen. A read can land late: each one carries a token, and only the
// latest look of its Journey may write what it read.

import type { HostEvent, HostResultBody, Journey, SessionSummary } from "@mirror-desktop/protocol";
import { create } from "zustand";

import { failureOf, type HostConnection } from "../host/client.ts";
import { registerStore } from "../stores/registry.ts";
import { connectionLostNotice, extensionNotice, reduceRows, type Row, rowsOf } from "./transcript.ts";

export interface Session {
  readonly id: string;
  /** Pi's session file, which says whether the session shown is this one. */
  readonly file: string;
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

/** The session a conversation shows: one of the Journey's files, or a new one, which the first send starts. */
export type Shown = { readonly kind: "file"; readonly file: string } | { readonly kind: "new" };

/** The Journey's sessions, as the header's list shows them. */
export interface SessionsList {
  readonly status: "loading" | "loaded" | "failed";
  /** Newest first. Kept while the list is read again. */
  readonly sessions: readonly SessionSummary[];
  readonly failure?: string;
}

/** Reading what the conversation shows: the Journey's list first, then the session's file. */
export type Reading = { readonly status: "reading" } | { readonly status: "failed"; readonly failure: string };

export interface Conversation {
  readonly status: ConversationStatus;
  readonly draft: string;
  readonly rows: Row[];
  /** A prompt was sent and its turn has not settled. */
  readonly running: boolean;
  /** The Journey's open session. It may not be the one shown: a pick is a look, and only a send opens. */
  readonly session?: Session;
  readonly failure?: string;
  readonly shown: Shown;
  /** Absent until the Journey is shown for the first time. */
  readonly sessions?: SessionsList;
  /** Absent once what is shown has been read, or when there is nothing to read. */
  readonly reading?: Reading;
}

export interface ConversationsState {
  /** The Journey on screen. */
  readonly current: string | null;
  readonly entries: Readonly<Record<string, Conversation>>;
}

const initialState: ConversationsState = { current: null, entries: {} };
const IDLE: Conversation = { status: "idle", draft: "", rows: [], running: false, shown: { kind: "new" } };

/**
 * Bumped by every reset. An action that was waiting on the host when the
 * stores were reset (between two tests) finds it changed and writes nothing.
 */
let epoch = 0;

/**
 * Each Journey's latest look: bumped by every pick, so a read that lands
 * after a later pick finds it changed and writes nothing.
 */
const looks = new Map<string, number>();

export const useConversations = create<ConversationsState>()(() => initialState);
registerStore("conversations", useConversations, initialState, () => {
  epoch += 1;
  looks.clear();
});

/** Whether the Journey is busy on the person's behalf: opening its session for a message, or answering one. */
export function isWorking(conversation: Conversation | undefined): boolean {
  return conversation !== undefined && (conversation.status === "opening" || conversation.running);
}

/** Whether the conversation shows its open session, the one a send prompts. */
export function showsOpenSession(conversation: Conversation | undefined): boolean {
  return conversation?.session !== undefined && conversation.shown.kind === "file" && conversation.shown.file === conversation.session.file;
}

/** The shown session as the Journey's list has it; undefined for a new session, or one the list does not have yet. */
export function shownSummary(conversation: Conversation | undefined): SessionSummary | undefined {
  const shown = conversation?.shown;
  if (shown?.kind !== "file") return undefined;
  return conversation?.sessions?.sessions.find((summary) => summary.file === shown.file);
}

/** Make `journeyId` the one on screen, keeping every other conversation as it is. Asks the host for nothing. */
export function selectJourney(journeyId: string): void {
  useConversations.setState((state) => ({
    current: journeyId,
    entries: state.entries[journeyId] ? state.entries : { ...state.entries, [journeyId]: IDLE },
  }));
}

/**
 * Show a Journey: make it current and, the first time, list its sessions and
 * show the most recent, read from its file. A Journey with no project path
 * has nowhere for a session to run, so nothing to list. Shown again, a
 * Journey is as it was left: its draft, its transcript, its running turn.
 */
export async function showJourney(client: HostConnection, journey: Pick<Journey, "id" | "projectPath">): Promise<void> {
  selectJourney(journey.id);
  if (!journey.projectPath || entryOf(journey.id).sessions) return;
  await listAndShowNewest(client, journey.id);
}

/** The list could not be read: read it again, and show the most recent session if nothing was sent meanwhile. */
export async function retrySessions(client: HostConnection, journeyId: string): Promise<void> {
  if (entryOf(journeyId).sessions?.status !== "failed") return;
  await listAndShowNewest(client, journeyId);
}

/** Show one of the Journey's sessions, read from its file. A look: nothing opens or closes. Not while a turn runs. */
export async function chooseSession(client: HostConnection, journeyId: string, file: string): Promise<void> {
  const conversation = entryOf(journeyId);
  if (isWorking(conversation)) return;
  if (conversation.shown.kind === "file" && conversation.shown.file === file) return;
  const look = nextLook(journeyId);
  update(journeyId, (current) => ({ ...showing(current, { kind: "file", file }), reading: { status: "reading" } }));
  await readShown(client, journeyId, file, look);
}

/** Show a new session, empty until the first send starts it. Not while a turn runs. */
export function startNewSession(journeyId: string): void {
  const conversation = entryOf(journeyId);
  if (isWorking(conversation) || conversation.shown.kind === "new") return;
  nextLook(journeyId);
  update(journeyId, (current) => withoutReading(showing(current, { kind: "new" })));
}

/** The shown session's file could not be read: read it again. */
export async function retryRead(client: HostConnection, journeyId: string): Promise<void> {
  const { shown, reading } = entryOf(journeyId);
  if (shown.kind !== "file" || reading?.status !== "failed") return;
  const look = nextLook(journeyId);
  update(journeyId, (current) => ({ ...current, reading: { status: "reading" } }));
  await readShown(client, journeyId, shown.file, look);
}

/**
 * List the Journey's sessions again, keeping what is shown: after a turn,
 * so a session the turn started is listed and named.
 */
export async function refreshSessions(client: HostConnection, journeyId: string): Promise<void> {
  await listSessions(client, journeyId);
}

export function setDraft(journeyId: string, draft: string): void {
  update(journeyId, (conversation) => ({ ...conversation, draft }));
}

/**
 * Send the Journey's draft: open the shown session first unless it is the
 * open one (resuming its file, or starting a new session when a new one is
 * shown), then prompt it. The message shows at once, after what was read.
 * Refused, with the draft kept, while the session opens or a turn runs.
 *
 * A failed open is a standing state, shown in the conversation; the message
 * goes back into the draft, so sending again retries. A refused prompt is a
 * failed action: it is rolled back the same way, and the returned promise
 * rejects so the composer can say why, unless what refused it was the
 * connection's loss, which the shell says in the composer's place.
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

  let session = before.status === "open" && showsOpenSession(before) ? before.session : undefined;
  if (!session) {
    // A file that could not be read is resumed anyway: what failed to read it may not stop Pi.
    const resumed = before.shown.kind === "file" ? before.shown.file : undefined;
    update(journeyId, (conversation) => ({ ...conversation, status: "opening" }));
    let opened: HostResultBody;
    try {
      opened = await client.request({ type: "session.open", journey: journeyId, ...(resumed ? { sessionFile: resumed } : {}) });
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
    // What failed to load is said where this session begins: after what was read, before the message.
    update(journeyId, (conversation) => ({
      ...conversation,
      status: "open",
      session: openedSession,
      shown: { kind: "file", file: openedSession.file },
      rows: insertBefore(conversation.rows, sent, diagnostics),
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
    if (failureOf(error).code === "connection_lost") return;
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

/**
 * The connection to the host ended. A conversation whose answer was
 * streaming has nothing pending to reject (the prompt was answered before
 * the first event), so it is settled here: not running, and a notice after
 * the partial answer saying why it stopped. A send still waiting on the
 * host is settled by its own rejection. Every other conversation is left as
 * it is. The sessions these conversations hold are the old host's; what a
 * reconnected UI does with them is CV1.DS2.TS1's.
 */
export function connectionLost(): void {
  useConversations.setState((state) => ({
    entries: Object.fromEntries(
      Object.entries(state.entries).map(([journeyId, conversation]) => [
        journeyId,
        conversation.running && conversation.status === "open"
          ? { ...conversation, running: false, rows: [...conversation.rows, connectionLostNotice()] }
          : conversation,
      ]),
    ),
  }));
}

/**
 * Fold a host event into the conversation whose session it names. When a
 * turn settles and the connection is given, the Journey's list is read
 * again, so a session that turn started is listed and named.
 */
export function applyHostEvent(event: HostEvent, client?: HostConnection): void {
  if (event.type !== "session.event" && event.type !== "session.extension_error") return;
  const journeyId = journeyOfSession(event.sessionId);
  // An event for a session no conversation knows is dropped. In this app that
  // can only be an extension failing while its session opens, before the
  // open's answer names the session: the console lost those too, and the
  // answer's diagnostics carry what failed to load.
  if (journeyId === undefined) return;
  // Rows go to the transcript of the session they belong to: shown, as it is
  // while a turn runs, since no other session can be picked then.
  const shown = showsOpenSession(entryOf(journeyId));
  if (event.type === "session.extension_error") {
    const notice = extensionNotice(event);
    if (shown) update(journeyId, (conversation) => ({ ...conversation, rows: [...conversation.rows, notice] }));
    return;
  }
  const settled = event.event.type === "agent_settled";
  update(journeyId, (conversation) => ({
    ...conversation,
    ...(shown ? { rows: reduceRows(conversation.rows, event.event) } : {}),
    ...(settled ? { running: false } : {}),
  }));
  if (settled && client) void refreshSessions(client, journeyId);
}

/** List the Journey's sessions; then, unless a pick or a send came first, show the most recent. */
async function listAndShowNewest(client: HostConnection, journeyId: string): Promise<void> {
  const look = nextLook(journeyId);
  update(journeyId, (conversation) => ({ ...conversation, reading: { status: "reading" } }));
  const sessions = await listSessions(client, journeyId);
  if (!looking(journeyId, look)) return;
  const untouched = (conversation: Conversation) => conversation.shown.kind === "new" && !conversation.session && conversation.rows.length === 0;
  const newest = sessions?.[0];
  if (!newest || !untouched(entryOf(journeyId))) {
    update(journeyId, withoutReading);
    return;
  }
  update(journeyId, (conversation) => ({ ...conversation, shown: { kind: "file", file: newest.file } }));
  await readShown(client, journeyId, newest.file, look);
}

/** Read the Journey's list into its conversation; the sessions, or undefined when the read failed or went stale. */
async function listSessions(client: HostConnection, journeyId: string): Promise<readonly SessionSummary[] | undefined> {
  const mine = epoch;
  update(journeyId, (conversation) => ({ ...conversation, sessions: { status: "loading", sessions: conversation.sessions?.sessions ?? [] } }));
  try {
    const listed = await client.request({ type: "sessions.list", journey: journeyId });
    if (listed.type !== "sessions.list") throw new Error("The host answered sessions.list with something else.");
    if (mine !== epoch) return undefined;
    update(journeyId, (conversation) => ({ ...conversation, sessions: { status: "loaded", sessions: listed.sessions } }));
    return listed.sessions;
  } catch (error) {
    if (mine !== epoch) return undefined;
    const failure = failureOf(error).message;
    update(journeyId, (conversation) => ({ ...conversation, sessions: { status: "failed", sessions: conversation.sessions?.sessions ?? [], failure } }));
    return undefined;
  }
}

/** Read the shown session's file into the transcript, before anything sent meanwhile. Written only by the latest look. */
async function readShown(client: HostConnection, journeyId: string, file: string, look: number): Promise<void> {
  const mine = epoch;
  try {
    const read = await client.request({ type: "session.transcript", journey: journeyId, sessionFile: file });
    if (read.type !== "session.transcript") throw new Error("The host answered session.transcript with something else.");
    if (mine !== epoch || !looking(journeyId, look)) return;
    update(journeyId, (conversation) => withoutReading({ ...conversation, rows: [...rowsOf(read.entries, read.earlier), ...conversation.rows] }));
  } catch (error) {
    if (mine !== epoch || !looking(journeyId, look)) return;
    update(journeyId, (conversation) => ({ ...conversation, reading: { status: "failed", failure: failureOf(error).message } }));
  }
}

function nextLook(journeyId: string): number {
  const look = (looks.get(journeyId) ?? 0) + 1;
  looks.set(journeyId, look);
  return look;
}

function looking(journeyId: string, look: number): boolean {
  return looks.get(journeyId) === look;
}

/** The conversation showing `shown`, from an empty transcript; a standing open failure belonged to the last look. */
function showing(conversation: Conversation, shown: Shown): Conversation {
  return { ...withoutFailure(conversation), status: conversation.session ? "open" : "idle", shown, rows: [] };
}

function withoutReading(conversation: Conversation): Conversation {
  const { reading: _done, ...rest } = conversation;
  return rest;
}

/** `rows` with `inserted` placed just before `row`, or at the end when `row` is not there. */
function insertBefore(rows: Row[], row: Row, inserted: Row[]): Row[] {
  const at = rows.indexOf(row);
  return at === -1 ? [...rows, ...inserted] : [...rows.slice(0, at), ...inserted, ...rows.slice(at)];
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
    file: opened.sessionFile,
    cwd: opened.cwd,
    ...(opened.model ? { model: `${opened.model.provider}/${opened.model.id}` } : {}),
    thinkingLevel: opened.thinkingLevel,
  };
}

function withoutFailure(conversation: Conversation): Conversation {
  const { failure: _cleared, ...rest } = conversation;
  return rest;
}
