// The pieces the header's model and thinking controls share (CV1.DS2.US3):
// the button that names what is shown and opens its list, what stands in
// its place before anything is known or when there is nothing to pick, and
// the list it opens at the header's right edge.

import { ChevronDown } from "lucide-react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { HEADER_CONTROL, HEADER_FACT } from "./buttons.ts";
import { Pulse } from "./Pulse.tsx";

/** Above the options while the session opens: the open already carries what was picked. */
export const OPENING = "Opening the session…";

/**
 * A control's button: named "<what>: <value>", opening its list. While a
 * change waits on the host it is busy, the pulse in the chevron's place, and
 * takes no click; busy, not disabled, so the keyboard's focus stays where
 * the pick left it (a focused element that becomes disabled gives the focus
 * back to the page).
 */
export function ControlButton({
  what,
  value,
  open,
  busy,
  color,
  title,
  button,
  onOpen,
  onDismiss,
  children,
}: {
  what: string;
  value: string;
  open: boolean;
  busy: boolean;
  color: string;
  title?: string | undefined;
  button: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <button
      ref={button}
      type="button"
      aria-label={`${what}: ${value}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-busy={busy}
      aria-disabled={busy ? "true" : undefined}
      title={title}
      onClick={() => {
        if (busy) return;
        if (open) onDismiss();
        else onOpen();
      }}
      className={`${HEADER_CONTROL} ${color}`}
    >
      {children}
      {busy ? <Pulse /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />}
    </button>
  );
}

/** A control before what it shows has been read: a dim ellipsis, disabled. */
export function ControlPlaceholder({ what }: { what: string }) {
  return (
    <button type="button" disabled aria-label={`${what}: reading…`} className={`${HEADER_CONTROL} shrink-0 text-dim`}>
      …
    </button>
  );
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
