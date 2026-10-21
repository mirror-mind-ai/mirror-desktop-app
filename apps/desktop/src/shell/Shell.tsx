import type { Journey } from "@mirror-desktop/protocol";
import { useMemo, useState } from "react";

import { useConversations } from "../conversations/store.ts";
import { useHost } from "../host/store.ts";
import { useJourneys } from "../journeys/store.ts";
import { Conversation } from "./Conversation.tsx";
import { EmptyConversation } from "./EmptyConversation.tsx";
import { HostUnreachable } from "./HostUnreachable.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { SignInPanel } from "./SignInPanel.tsx";

const NONE: readonly Journey[] = [];

/**
 * The window: the Journeys sidebar beside the conversation area.
 *
 * The area shows one thing at a time. Without the host, that nothing can work
 * and a way to try again; while the person signs in, the sign-in panel; the
 * picked Journey's conversation; with no model to use, the sign-in panel; and
 * otherwise an invitation to pick a Journey, when there is one to pick.
 *
 * The window's title bar is an overlay: the traffic lights sit over the
 * sidebar's top, and the top of each column is where the window drags.
 */
export function Shell() {
  const status = useHost((state) => state.status);
  const canUseModels = useHost((state) => state.canUseModels);
  const journeys = useJourneys();
  const current = useConversations((state) => state.current);
  const [signingIn, setSigningIn] = useState(false);

  const listed = journeys.status === "loaded" ? journeys.journeys : NONE;
  const shown = useMemo(() => listed.find((journey) => journey.id === current && journey.status === "active"), [listed, current]);
  const anyToPick = useMemo(() => listed.some((journey) => journey.status === "active"), [listed]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar onSignIn={() => setSigningIn(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        {status === "ready" && !signingIn && shown ? (
          <Conversation key={shown.id} journey={shown} />
        ) : (
          <>
            <div className="h-12 shrink-0" data-tauri-drag-region />
            {status === "failed" ? (
              <HostUnreachable />
            ) : status !== "ready" ? null : signingIn ? (
              <SignInPanel onDone={() => setSigningIn(false)} />
            ) : !canUseModels ? (
              <SignInPanel />
            ) : anyToPick ? (
              <EmptyConversation />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
