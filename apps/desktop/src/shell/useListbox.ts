import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

/**
 * A list a header button opens, as the ARIA listbox pattern has it: focus
 * moves into the list, the arrows, Home and End move through it, Enter and
 * Space pick, Escape and a click outside close it, Tab leaves it. The
 * header's lists share it (the sessions, the model, the thinking level), so
 * they behave alike; each draws its own button and options, and says what a
 * pick does.
 *
 * Escape here is the overlay rule's first case (useEscapeToStop): the list
 * takes it, by preventing its default, and a running turn goes on.
 */
export function useListbox({ count, onPick }: { count: number; onPick: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    listbox.current?.focus();
    const close = (event: MouseEvent) => {
      if (event.target instanceof Node && wrapper.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // The active option stays in view in a long list: the current one when it opens, then the arrows'.
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  /** Open the list with `at` active. */
  function show(at: number): void {
    setActive(at);
    setOpen(true);
  }

  /** Close the list and give the focus back to its button. */
  function close(): void {
    setOpen(false);
    button.current?.focus();
  }

  /** Close the list where the focus already is: a second click on its button. */
  function dismiss(): void {
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, count - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(count - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onPick(active);
        return;
      case "Escape":
        // The list takes Escape: closing it never stops a turn.
        event.preventDefault();
        close();
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
  }

  return { open, active, setActive, wrapper, button, listbox, optionId, show, close, dismiss, onKeyDown };
}
