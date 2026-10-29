import type { Journey } from "@mirror-desktop/protocol";
import { useId } from "react";

import {
  type Conversation as ConversationState,
  retryRead,
  retrySessions,
  showsOpenSession,
  useConversations,
} from "../conversations/store.ts";
import type { Row } from "../conversations/transcript.ts";
import { useHost } from "../host/store.ts";
import { Transcript } from "../transcript/Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { Pulse } from "./Pulse.tsx";
import { RefreshJourneys } from "./RefreshJourneys.tsx";
import { SessionsList } from "./SessionsList.tsx";
import { shortenHome } from "./shortenHome.ts";
import { SignInPanel } from "./SignInPanel.tsx";

const NO_ROWS: readonly Row[] = [];

/**
 * One Journey's conversation: its header, its transcript and its composer.
 *
 * Mounted per Journey (the shell keys it by id), so nothing of one Journey's
 * screen is ever reused for another's. The header names the session shown
 * and opens the Journey's sessions; it says where the Journey would run
 * until a send opens the session shown, then where that session actually
 * runs, with its model and thinking level. The transcript and the composer
 * sit in the reading measure; the header spans the window.
 */
export function Conversation({ journey }: { journey: Journey }) {
  const conversation = useConversations((state) => state.entries[journey.id]);
  const canUseModels = useHost((state) => state.canUseModels);
  const headingId = useId();
  const session = conversation?.status === "open" && showsOpenSession(conversation) ? conversation.session : undefined;
  const where = session?.cwd ?? journey.projectPath;

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-4 border-b border-hairline px-5">
        <h1 id={headingId} className="shrink-0 text-title">
          {journey.name}
        </h1>
        {journey.projectPath && canUseModels ? <SessionsList journeyId={journey.id} conversation={conversation} /> : null}
        <p className="flex min-w-0 items-center gap-4 truncate font-mono text-ui text-muted">
          {where ? <span>{shortenHome(where)}</span> : null}
          {session?.model ? <span>{session.model}</span> : null}
          {session ? <span>thinking {session.thinkingLevel}</span> : null}
        </p>
      </header>
      {!journey.projectPath ? (
        <NoProjectPath journey={journey} />
      ) : !canUseModels ? (
        <SignInPanel />
      ) : (
        <>
          <Transcript rows={conversation?.rows ?? NO_ROWS}>
            <SessionState journeyId={journey.id} where={shortenHome(journey.projectPath)} conversation={conversation} />
          </Transcript>
          <Composer journeyId={journey.id} conversation={conversation} />
        </>
      )}
    </section>
  );
}

/**
 * What the conversation says about its session below the rows, the first
 * that applies: opening; an open that failed and what to do; reading what to
 * show; a session or a list that could not be read, with Try again; and a new
 * session, which the first message starts. Every failure leaves the composer
 * able to send.
 */
function SessionState({ journeyId, where, conversation }: { journeyId: string; where: string; conversation: ConversationState | undefined }) {
  const client = useHost((state) => state.client);
  if (conversation?.status === "opening") {
    return (
      <p className="flex items-center gap-2 text-ui text-muted">
        <Pulse />
        Opening in {where}…
      </p>
    );
  }
  if (conversation?.status === "failed") {
    return (
      <div className="flex flex-col gap-1 text-body">
        <p>The session could not open in {where}.</p>
        {conversation.failure ? <p className="font-mono text-ui text-muted">{conversation.failure}</p> : null}
        <p className="text-ui text-muted">Your message is back in the composer: send it again to retry.</p>
      </div>
    );
  }
  if (conversation?.reading?.status === "reading") {
    return (
      <p className="flex items-center gap-2 text-ui text-muted">
        <Pulse />
        Reading the session…
      </p>
    );
  }
  if (conversation?.reading?.status === "failed") {
    return (
      <ReadFailure
        what="This session could not be read."
        failure={conversation.reading.failure}
        next="The first message still resumes it."
        onTryAgain={() => client && void retryRead(client, journeyId)}
      />
    );
  }
  const untouched = conversation?.shown.kind !== "file" && (conversation?.rows.length ?? 0) === 0;
  if (untouched && conversation?.sessions?.status === "failed") {
    return (
      <ReadFailure
        what={`The sessions in ${where} could not be read.`}
        failure={conversation.sessions.failure}
        next="The first message starts a new session."
        onTryAgain={() => client && void retrySessions(client, journeyId)}
      />
    );
  }
  if (untouched) return <p className="text-ui text-muted">A new session in {where}. The first message starts it.</p>;
  return null;
}

/** A read that failed: what, the host's words, what still works, and Try again. */
function ReadFailure({ what, failure, next, onTryAgain }: { what: string; failure: string | undefined; next: string; onTryAgain: () => void }) {
  return (
    <div className="flex flex-col gap-1 text-body">
      <p>{what}</p>
      {failure ? <p className="font-mono text-ui text-muted">{failure}</p> : null}
      <p className="text-ui text-muted">{next}</p>
      <button type="button" onClick={onTryAgain} className="mt-1 w-fit rounded-control border border-hairline px-2.5 py-1 text-ui hover:bg-hover">
        Try again
      </button>
    </div>
  );
}

function NoProjectPath({ journey }: { journey: Journey }) {
  return (
    <div className="mx-auto flex w-full max-w-measure flex-col gap-3 px-5 py-6 text-body">
      <p>{journey.name} has no project path yet, so there is nowhere for a session to run.</p>
      <p className="text-muted">Give it one in a terminal, then refresh:</p>
      <code className="w-fit rounded-control bg-raised px-2 py-1 font-mono text-ui select-text">
        mirror journey set-path {journey.id} /path/to/project
      </code>
      <RefreshJourneys label="Refresh" />
    </div>
  );
}
