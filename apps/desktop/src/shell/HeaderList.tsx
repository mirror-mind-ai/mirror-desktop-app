import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { shownChoice } from "../conversations/headerChoice.ts";
import type { Conversation } from "../conversations/store.ts";
import { HEADER_FACT } from "./buttons.ts";

/** Above the options while the session opens: the open already carries what was picked. */
export const OPENING = "Opening the session…";

/**
 * When a pick takes effect, said at the list's foot: with the first message
 * for a session not open yet; at Pi's next request while a turn runs;
 * nothing for an idle open session, where it takes effect at once.
 */
export function whenItTakesEffect(conversation: Conversation | undefined): string | undefined {
  const source = shownChoice(conversation)?.source;
  if (source === undefined) return undefined;
  if (source !== "session") return "Takes effect with your first message.";
  return conversation?.running ? "Pi takes it at its next request in this run, or at your next message." : undefined;
}

/**
 * The popover a header control opens at the header's right edge, where the
 * model and the thinking level sit: a line above the options when they
 * cannot be picked now, the options, and a line at the foot saying when a
 * pick takes effect. The lines are statements, not live regions: the
 * composer's own status line already speaks while a turn runs.
 */
export function HeaderList({
  label,
  listId,
  listbox,
  activeId,
  onKeyDown,
  above,
  foot,
  filter,
  children,
}: {
  label: string;
  /** The listbox's id, for a filter field that controls it. */
  listId?: string;
  listbox: RefObject<HTMLUListElement | null>;
  activeId: string;
  onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
  above?: string | undefined;
  foot?: string | undefined;
  /** A filter field above the options, for a list long enough to need one. */
  filter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="absolute top-full right-0 z-10 mt-1 flex w-96 flex-col rounded-control border border-hairline bg-raised py-1">
      {above ? <p className="px-3 py-1 text-ui text-muted">{above}</p> : null}
      {filter}
      <ul
        ref={listbox}
        id={listId}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        aria-activedescendant={activeId}
        onKeyDown={onKeyDown}
        className="max-h-80 overflow-y-auto outline-none"
      >
        {children}
      </ul>
      {foot ? <p className="border-t border-hairline px-3 pt-1.5 pb-0.5 text-meta text-dim">{foot}</p> : null}
    </div>
  );
}

/** One option of a header list: the active one shaded, the current one bold, every one dim and inert while nothing can be picked. */
export function optionClass({ active, current, disabled }: { active: boolean; current: boolean; disabled: boolean }): string {
  return `flex items-center gap-3 px-3 py-1.5 text-ui ${active ? "bg-hover" : ""} ${current ? "font-bold" : ""} ${
    disabled ? "text-dim" : "cursor-pointer text-ink"
  }`;
}

/** A header fact that stands where a control would when there is nothing to pick: the same box, no hover. */
export function HeaderFact({ text, title, dim = false }: { text: string; title: string; dim?: boolean }) {
  return (
    <span title={title} className={`${HEADER_FACT} ${dim ? "text-dim" : "text-muted"}`}>
      {text}
    </span>
  );
}
