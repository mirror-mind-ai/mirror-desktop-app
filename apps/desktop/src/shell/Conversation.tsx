import type { Journey } from "@mirror-desktop/protocol";
import { useId } from "react";

import { type Conversation as ConversationState, useConversations } from "../conversations/store.ts";
import type { Row } from "../conversations/transcript.ts";
import { useHost } from "../host/store.ts";
import { Transcript } from "../transcript/Transcript.tsx";
import { Composer } from "./Composer.tsx";
import { Pulse } from "./Pulse.tsx";
import { RefreshJourneys } from "./RefreshJourneys.tsx";
import { shortenHome } from "./shortenHome.ts";
import { SignInPanel } from "./SignInPanel.tsx";

const NO_ROWS: readonly Row[] = [];

/**
 * One Journey's conversation: its header, its transcript and its composer.
 *
 * Mounted per Journey (the shell keys it by id), so nothing of one Journey's
 * screen is ever reused for another's. The header says where the Journey
 * would run until the first send opens its session, then where the session
 * actually runs, with its model and thinking level. The transcript and the
 * composer sit in the reading measure; the header spans the window.
 */
export function Conversation({ journey }: { journey: Journey }) {
  const conversation = useConversations((state) => state.entries[journey.id]);
  const canUseModels = useHost((state) => state.canUseModels);
  const headingId = useId();
  const session = conversation?.status === "open" ? conversation.session : undefined;
  const where = session?.cwd ?? journey.projectPath;

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-4 border-b border-hairline px-5">
        <h1 id={headingId} className="shrink-0 text-title">
          {journey.name}
        </h1>
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
            <SessionState where={shortenHome(journey.projectPath)} conversation={conversation} />
          </Transcript>
          <Composer journeyId={journey.id} conversation={conversation} />
        </>
      )}
    </section>
  );
}

/** What the conversation says about its session below the rows: opening, or an open that failed and what to do. */
function SessionState({ where, conversation }: { where: string; conversation: ConversationState | undefined }) {
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
  return null;
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
