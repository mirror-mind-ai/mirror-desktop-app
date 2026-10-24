import { ChevronRight } from "lucide-react";
import { useContext, useId, useState } from "react";

import { Following } from "./following.ts";

/**
 * What the model thought before answering, as Pi draws it: muted and italic
 * in Pi's thinking color. Open while it streams; folded to one line once the
 * answer's text begins or the message ends, "Thinking…" until then and
 * "Thought" after; a click opens or folds it.
 *
 * The fold is derived, not initialized: shown open is the person's own choice
 * once they made one, and otherwise whether the answer has yet to begin. The
 * fold happens only while the transcript follows the stream; a person who
 * scrolled up to read keeps the thinking open until they fold it or follow
 * again. Plain text, not Markdown: a thought is read, not studied, and a
 * second parser on every delta would be one more surface for the model's text.
 */
export function Thinking({ text, answered, done }: { text: string; answered: boolean; done: boolean }) {
  const following = useContext(Following);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const settled = answered || done;
  const [folded, setFolded] = useState(() => settled && following);
  if (!folded && settled && following) setFolded(true);
  const open = chosen ?? !folded;
  const thoughtId = useId();

  return (
    <div className="flex flex-col gap-1 italic text-thinking">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={thoughtId}
        onClick={() => setChosen(!open)}
        className="flex w-fit items-center gap-1 rounded-control text-ui outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ChevronRight aria-hidden="true" className={`size-3.5 ${open ? "rotate-90" : ""}`} />
        {done ? "Thought" : "Thinking…"}
      </button>
      {open ? (
        <p id={thoughtId} className="text-body whitespace-pre-wrap italic text-thinking">
          {text}
        </p>
      ) : null}
    </div>
  );
}
