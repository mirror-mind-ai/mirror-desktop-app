import { useEffect } from "react";

/**
 * Escape stops the turn, from wherever the hands are in the window: in the
 * text box, on a Copy button, on "Jump to latest". The listener is on the
 * window only while a turn runs, so an idle Escape reaches nothing and
 * never touches the draft.
 *
 * It stops once: a held key repeats its keydown and is ignored after the
 * first. An IME that cancels its composition with Escape keeps it. And the
 * overlay rule: anything closable that handles Escape first, by preventing
 * its default (DS2.US3's model and thinking pickers will), keeps the turn
 * running; closing a menu must never stop an answer.
 */
export function useEscapeToStop(running: boolean, stop: () => void): void {
  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.isComposing || event.defaultPrevented) return;
      stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, stop]);
}
