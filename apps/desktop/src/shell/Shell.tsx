import type { Journey } from "@mirror-desktop/protocol";
import { type ReactNode, useMemo, useState } from "react";

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
 * The window's title bar is an overlay: the traffic lights sit over the
 * sidebar's top, and the top of each column is where the window drags.
 */
export function Shell() {
  const [signingIn, setSigningIn] = useState(false);
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <Sidebar onSignIn={() => setSigningIn(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <ConversationArea signingIn={signingIn} onSignInDone={() => setSigningIn(false)} />
      </main>
    </div>
  );
}

/**
 * What the conversation area shows: one thing at a time, the first that
 * applies, in this order.
 */
function ConversationArea({ signingIn, onSignInDone }: { signingIn: boolean; onSignInDone: () => void }) {
  const status = useHost((state) => state.status);
  const canUseModels = useHost((state) => state.canUseModels);
  const journeys = useJourneys();
  const current = useConversations((state) => state.current);

  const listed = journeys.status === "loaded" ? journeys.journeys : NONE;
  const shown = useMemo(() => listed.find((journey) => journey.id === current && journey.status === "active"), [listed, current]);
  const anyToPick = useMemo(() => listed.some((journey) => journey.status === "active"), [listed]);

  // Without the host nothing can work, and the area says so.
  if (status === "failed") return <UnderDragStrip><HostUnreachable /></UnderDragStrip>;
  // The host is still connecting: the area stays quiet.
  if (status !== "ready") return <UnderDragStrip />;
  // The person opened sign-in from the sidebar.
  if (signingIn) return <UnderDragStrip><SignInPanel onDone={onSignInDone} /></UnderDragStrip>;
  // The picked Journey's conversation, which signs in in its own place when no model can be used.
  if (shown) return <Conversation key={shown.id} journey={shown} />;
  // Nothing picked and no model to use: signing in is the next step.
  if (!canUseModels) return <UnderDragStrip><SignInPanel /></UnderDragStrip>;
  // Nothing picked: the sidebar is where the person acts, when it has something to pick.
  if (anyToPick) return <UnderDragStrip><EmptyConversation /></UnderDragStrip>;
  return <UnderDragStrip />;
}

/** The area's top, where the window drags, over anything but a conversation, whose header drags instead. */
function UnderDragStrip({ children }: { children?: ReactNode }) {
  return (
    <>
      <div className="h-12 shrink-0" data-tauri-drag-region />
      {children}
    </>
  );
}
