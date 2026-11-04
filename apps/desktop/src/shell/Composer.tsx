import type { StreamingBehavior } from "@mirror-desktop/protocol";
import { CornerDownRight, Send, Square } from "lucide-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { abort, type Conversation, queueMessage, send, setDraft } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { useHost } from "../host/store.ts";
import { ACCENT_BUTTON, PLAIN_BUTTON } from "./buttons.ts";
import { QueuedMessages } from "./QueuedMessages.tsx";
import { useEscapeToStop } from "./useEscapeToStop.ts";

/** What the composer says under the text box while a turn runs: what each key does to it. */
const RUNNING = "Pi is answering. Enter sends before its next step, Option+Enter after it finishes, Escape stops it.";

/** A message Pi ran as an extension command reached no model; said once, as a refusal is. */
const HANDLED = "Pi ran that as a command; nothing was sent to the model.";

/**
 * The composer: Enter sends (not while an IME composes), Shift+Enter breaks a
 * line, Escape stops the turn from anywhere in the window. It takes focus
 * when its conversation mounts, which the shell does per Journey, so picking
 * and typing is one motion. The draft lives in the conversation, so it
 * survives switching Journeys.
 *
 * While a turn runs it is never dead (CV1.DS2.US2): Enter sends the draft
 * into the turn as a steer, which Pi delivers before its next step, and
 * Option+Enter as a follow-up, delivered when the answer would otherwise
 * end, as Pi's terminal keys them; Steer, Follow up and Stop are their
 * buttons. What waits is listed above the text box (QueuedMessages). A line
 * under the text box says what each key does, in the register of the
 * conversation's other lines. When something goes back in the draft (a
 * stop's withdrawn messages, a refusal), the text box takes focus again.
 * The conditions outside it are said elsewhere, once: no model by the
 * sign-in panel in the conversation's place, a host gone by the shell's
 * notice in place of the whole area. While the session opens, Send is
 * disabled and the transcript says what is happening.
 *
 * The overlay rule for Escape: anything closable that handles Escape first,
 * by preventing its default, keeps the turn running (useEscapeToStop).
 *
 * It sits in the transcript's measure, and marks focus with Pi's focus color
 * on its edge.
 */
export function Composer({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const draft = conversation?.draft ?? "";
  const running = conversation?.running ?? false;
  const opening = conversation?.status === "opening";

  const stop = useCallback(() => {
    if (!client) return;
    abort(client, journeyId).then(
      () => textBox.current?.focus(),
      // A refused stop is a failed action: said once, the turn left as it is.
      (error: unknown) => toast.error(failureOf(error).message),
    );
  }, [client, journeyId]);
  useEscapeToStop(running, stop);

  /** Send the draft: as a prompt while nothing runs; into the turn as `behavior` while one does. */
  async function submit(behavior: StreamingBehavior): Promise<void> {
    if (!client) return;
    try {
      const disposition = running ? await queueMessage(client, journeyId, behavior) : await send(client, journeyId);
      if (disposition === "handled") {
        toast(HANDLED);
        textBox.current?.focus();
      }
    } catch (error) {
      // A refused message is a failed action, so it is said once, as a toast;
      // the message is already back in the composer.
      toast.error(failureOf(error).message);
      textBox.current?.focus();
    }
  }

  return (
    <form
      className="shrink-0 border-t border-hairline px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit("steer");
      }}
    >
      <div className="mx-auto flex max-w-measure flex-col gap-1">
        <QueuedMessages conversation={conversation} />
        <div className="flex items-end gap-2">
          <textarea
            ref={textBox}
            aria-label="Message"
            // The conversation mounts per Journey, so picking one focuses its composer.
            autoFocus
            className="min-h-12 flex-1 resize-none rounded-control border border-hairline bg-raised px-3 py-2 text-body text-ink outline-none placeholder:text-dim focus:border-focus"
            placeholder="Say something to Pi…"
            value={draft}
            onChange={(event) => setDraft(journeyId, event.target.value)}
            onKeyDown={(event) => {
              // An Enter while an IME composes (a dead key on macOS) ends the composition, not the draft.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                // Option is Alt on macOS: Pi's terminal key for a follow-up.
                void submit(event.altKey ? "followUp" : "steer");
              }
            }}
          />
          {running ? (
            <>
              <button
                type="button"
                onClick={() => void submit("steer")}
                disabled={!draft.trim()}
                aria-keyshortcuts="Enter"
                title="Steer (Enter)"
                className={`${ACCENT_BUTTON} px-4 py-2`}
              >
                <Send className="size-3.5" aria-hidden="true" /> Steer
              </button>
              <button
                type="button"
                onClick={() => void submit("followUp")}
                disabled={!draft.trim()}
                aria-keyshortcuts="Alt+Enter"
                title="Follow up (Option+Enter)"
                className={`${PLAIN_BUTTON} px-4 py-2`}
              >
                <CornerDownRight className="size-3.5" aria-hidden="true" /> Follow up
              </button>
              <button
                type="button"
                onClick={stop}
                aria-keyshortcuts="Escape"
                title="Stop (Escape)"
                className={`${PLAIN_BUTTON} ml-2 px-4 py-2`}
              >
                <Square className="size-3.5" aria-hidden="true" /> Stop
              </button>
            </>
          ) : (
            <button type="submit" disabled={!draft.trim() || opening} className={`${ACCENT_BUTTON} px-4 py-2`}>
              <Send className="size-3.5" aria-hidden="true" /> Send
            </button>
          )}
        </div>
        {/* Always mounted, so a live region announces the change; empty while the composer can send. */}
        <p role="status" className="min-h-5 text-ui text-muted">
          {running ? RUNNING : ""}
        </p>
      </div>
    </form>
  );
}
