import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { chooseSession, type Conversation, isWorking, refreshSessions, shownSummary, startNewSession } from "../conversations/store.ts";
import { useHost } from "../host/store.ts";
import { sessionDate } from "./sessionDate.ts";

/** What the list says while a turn runs: why nothing can be picked, as a statement, and when it can be. */
const ANSWERING = "Pi is answering. Pick a session when it finishes.";

interface Option {
  readonly key: string;
  readonly title: string;
  readonly date?: string;
  readonly file?: string;
}

/**
 * The Journey's sessions, in the conversation's header: a button naming the
 * session shown, by its title and date, and the list it opens. "New session"
 * first, then the Journey's sessions newest first, the same files `pi -r`
 * lists in the project; the shown one marked and in view.
 *
 * Picking is a look: the transcript shows the session read from its file,
 * and nothing opens or closes until the first send. While a turn runs the
 * list still opens, to read, but its options are disabled and it says why.
 *
 * A listbox, as the ARIA pattern has it: focus moves into the list, the
 * arrows move through it, Enter picks, Escape and a click outside close it.
 * Escape here is the overlay rule's first case (useEscapeToStop): the list
 * takes it, by preventing its default, and the turn goes on.
 *
 * Titles are content, written by whoever typed the session's first message:
 * text nodes, never Markdown, cut to the button's width.
 */
export function SessionsList({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  const working = isWorking(conversation);
  const shown = conversation?.shown ?? { kind: "new" };
  const sessions = conversation?.sessions;
  const summary = shownSummary(conversation);
  const options: Option[] = [
    { key: "new", title: "New session" },
    ...(sessions?.sessions ?? []).map((session) => ({ key: session.file, title: session.title, date: sessionDate(session.modified), file: session.file })),
  ];
  const shownIndex = shown.kind === "file" ? Math.max(options.findIndex((option) => option.file === shown.file), 0) : 0;
  const firstRead = sessions === undefined || (sessions.status === "loading" && sessions.sessions.length === 0);

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

  // The active option stays in view in a long list: the shown one when it opens, then the arrows'.
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  function show(): void {
    setActive(shownIndex);
    setOpen(true);
    // What the list shows is kept; read again, it catches what another Pi wrote since.
    if (client) void refreshSessions(client, journeyId);
  }

  function close(): void {
    setOpen(false);
    button.current?.focus();
  }

  function pick(index: number): void {
    const option = options[index];
    if (!option || working) return;
    close();
    if (option.file === undefined) startNewSession(journeyId);
    else if (client) void chooseSession(client, journeyId, option.file);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(index + 1, options.length - 1));
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
        setActive(options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(active);
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

  const label = firstRead ? "Sessions…" : (summary?.title ?? "New session");
  const date = summary ? sessionDate(summary.modified) : undefined;

  return (
    <div ref={wrapper} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        // What it is, then what it shows: the visible text, whole, after "Sessions".
        aria-label={`Sessions: ${label}${date ? `, ${date}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className="flex max-w-96 min-w-0 items-center gap-2 rounded-control px-2 py-1 text-ui text-muted outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="min-w-0 truncate">{label}</span>
        {date ? <span className="shrink-0 text-dim">{date}</span> : null}
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-96 flex-col rounded-control border border-hairline bg-raised py-1">
          {working ? <p className="px-3 py-1 text-ui text-muted">{ANSWERING}</p> : null}
          <ul
            ref={listbox}
            role="listbox"
            aria-label="Sessions"
            tabIndex={0}
            aria-activedescendant={optionId(active)}
            onKeyDown={onKeyDown}
            className="max-h-80 overflow-y-auto outline-none"
          >
            {options.map((option, index) => (
              <li
                key={option.key}
                id={optionId(index)}
                role="option"
                aria-selected={index === shownIndex}
                aria-disabled={working ? "true" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
                className={`flex items-center gap-3 px-3 py-1.5 text-ui ${index === active ? "bg-hover" : ""} ${
                  index === shownIndex ? "font-bold" : ""
                } ${working ? "text-dim" : "cursor-pointer text-ink"}`}
              >
                <span className="min-w-0 flex-1 truncate">{option.title}</span>
                {option.date ? <span className="shrink-0 text-meta font-normal text-muted">{option.date}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
