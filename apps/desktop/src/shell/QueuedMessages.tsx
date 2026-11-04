import type { Conversation } from "../conversations/store.ts";

/**
 * What a running turn holds for later, above the text box, in the form Pi's
 * terminal lists it: each queued message after its kind, steering first, then
 * the follow-ups, as Pi's queue says, then whatever is still on its way to
 * Pi. One muted line each, cut with an ellipsis; the person's text, drawn as
 * text and never as Markdown. While the turn runs, a last line says what
 * Stop does with them, where the terminal says how to take them back.
 * Nothing at all when nothing waits.
 */
export function QueuedMessages({ conversation }: { conversation: Conversation | undefined }) {
  if (!conversation) return null;
  const lines = [
    ...conversation.queue.steering.map((text) => ({ kind: "Steering", text })),
    ...conversation.queue.followUp.map((text) => ({ kind: "Follow-up", text })),
    ...conversation.sending.map((sending) => ({ kind: "Sending", text: sending.text })),
  ];
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-ui text-muted">
      <ul aria-label="Queued messages" className="flex flex-col">
        {lines.map((line, index) => (
          <li key={`${index}:${line.kind}`} className="truncate">
            {line.kind}: {line.text}
          </li>
        ))}
      </ul>
      {conversation.running ? <p className="text-meta">Stop puts them back in the draft.</p> : null}
    </div>
  );
}
