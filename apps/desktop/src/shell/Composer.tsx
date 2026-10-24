import { Send, Square } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { abort, type Conversation, send, setDraft } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { useHost } from "../host/store.ts";
import { ACCENT_BUTTON } from "./buttons.ts";
import { useEscapeToStop } from "./useEscapeToStop.ts";

/**
 * The composer, moved from the spike console: Enter sends, Shift+Enter breaks
 * a line, Stop replaces Send while a turn runs. The draft lives in the
 * conversation, so it survives switching Journeys. The rest of the composer
 * (Escape, saying why it cannot send) is CV1.DS1.US3's. It sits in the
 * transcript's measure, and marks focus with Pi's focus color on its edge.
 */
export function Composer({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const draft = conversation?.draft ?? "";
  const running = conversation?.running ?? false;
  const opening = conversation?.status === "opening";

  const stop = useCallback(() => {
    if (client) void abort(client, journeyId);
  }, [client, journeyId]);
  useEscapeToStop(running, stop);

  async function submit(): Promise<void> {
    if (!client) return;
    try {
      await send(client, journeyId);
    } catch (error) {
      // A refused prompt is a failed action, so it is said once, as a toast;
      // the message is already back in the composer.
      toast.error(failureOf(error).message);
    }
  }

  return (
    <form
      className="shrink-0 border-t border-hairline px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="mx-auto flex max-w-measure items-end gap-2">
        <textarea
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
              void submit();
            }
          }}
        />
        {running ? (
          <button
            type="button"
            onClick={stop}
            aria-keyshortcuts="Escape"
            title="Stop (Escape)"
            className="flex items-center gap-2 rounded-control border border-hairline px-4 py-2 text-ui text-ink hover:bg-hover"
          >
            <Square className="size-3.5" aria-hidden="true" /> Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim() || opening}
            className={`${ACCENT_BUTTON} px-4 py-2`}
          >
            <Send className="size-3.5" aria-hidden="true" /> Send
          </button>
        )}
      </div>
    </form>
  );
}
