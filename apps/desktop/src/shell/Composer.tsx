import { Send, Square } from "lucide-react";
import { toast } from "sonner";

import { abort, type Conversation, send, setDraft } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { useHost } from "../host/store.ts";

/**
 * The composer, moved from the spike console: Enter sends, Shift+Enter breaks
 * a line, Stop replaces Send while a turn runs. The draft lives in the
 * conversation, so it survives switching Journeys. The rest of the composer
 * (Escape, saying why it cannot send) is CV1.DS1.US3's.
 */
export function Composer({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const draft = conversation?.draft ?? "";
  const running = conversation?.running ?? false;
  const opening = conversation?.status === "opening";

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
      className="flex items-end gap-2 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label="Message"
        className="min-h-[3rem] flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder="Say something to Pi…"
        value={draft}
        onChange={(event) => setDraft(journeyId, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {running ? (
        <button
          type="button"
          onClick={() => {
            if (client) void abort(client, journeyId);
          }}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
        >
          <Square className="size-4" aria-hidden="true" /> Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!draft.trim() || opening}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden="true" /> Send
        </button>
      )}
    </form>
  );
}
