import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { levelsOf, shownChoice } from "../conversations/headerChoice.ts";
import { chooseThinking, type Conversation } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { useHost } from "../host/store.ts";
import { HEADER_CONTROL } from "./buttons.ts";
import { HeaderFact, HeaderList, OPENING, optionClass, whenItTakesEffect } from "./HeaderList.tsx";
import { Pulse } from "./Pulse.tsx";
import { useListbox } from "./useListbox.ts";

/**
 * What each level means, in Pi's own words: carried from Pi's thinking
 * selector (`LEVEL_DESCRIPTIONS`, modes/interactive/components/
 * thinking-selector.js, pi-coding-agent 1.4.0). The token counts are Pi's
 * defaults, which a model may map differently; Pi says them all the same.
 */
const PI_DESCRIPTIONS: Readonly<Record<string, string>> = {
  off: "No reasoning",
  minimal: "Very brief reasoning (~1k tokens)",
  low: "Light reasoning (~2k tokens)",
  medium: "Moderate reasoning (~8k tokens)",
  high: "Deep reasoning (~16k tokens)",
  xhigh: "Extra-high reasoning (~32k tokens)",
  max: "Maximum reasoning",
};

/**
 * The thinking level the session shown runs on next, in the conversation's
 * header beside the model (CV1.DS2.US3), and the list of the levels that
 * model supports, in Pi's order, each with Pi's description and Pi's
 * default marked, as Pi's `/thinking` lists them.
 *
 * Nothing to pick is said as a fact in the control's place: "no thinking"
 * for a model that does not reason; the level alone for a model Pi cannot
 * use now; and a placeholder while the model is one Pi will choose at
 * start, since the levels belong to the model. Busy, held and opening read
 * as the model control does.
 */
export function ThinkingControl({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const models = useHost((state) => state.models);
  const shown = shownChoice(conversation);
  const levels = levelsOf(shown?.model, models) ?? [];
  const opening = conversation?.status === "opening";
  const busy = conversation?.configuring === true;
  const current = shown ? levels.indexOf(shown.thinkingLevel) : -1;
  const defaultLevel = conversation?.sessions?.defaults?.thinkingLevel;

  const { open, active, setActive, wrapper, button, listbox, optionId, show, close, dismiss, onKeyDown } = useListbox({
    count: levels.length,
    onPick: pick,
  });

  function pick(index: number): void {
    const level = levels[index];
    if (level === undefined || opening || !client) return;
    close();
    chooseThinking(client, journeyId, level).catch((error: unknown) => toast.error(failureOf(error).message));
  }

  if (!shown) {
    return (
      <button type="button" disabled aria-label="Thinking: reading…" className={`${HEADER_CONTROL} shrink-0 text-dim`}>
        …
      </button>
    );
  }
  if (!shown.model) return <HeaderFact text="thinking …" title="Pick a model to choose its thinking level." dim />;
  if (levels.length === 0) return <HeaderFact text={`thinking ${shown.thinkingLevel}`} title="Pi cannot use this model now." />;
  if (levels.length === 1 && levels[0] === "off") return <HeaderFact text="no thinking" title="This model does not reason." />;

  const color = shown.source === "pick" ? "text-ink" : "text-muted";
  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={`Thinking: ${shown.thinkingLevel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy}
        disabled={busy}
        onClick={() => (open ? dismiss() : show(Math.max(current, 0)))}
        className={`${HEADER_CONTROL} ${color}`}
      >
        <span className="whitespace-nowrap">thinking {shown.thinkingLevel}</span>
        {busy ? <Pulse /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />}
      </button>
      {open ? (
        <HeaderList
          label="Thinking levels"
          listbox={listbox}
          activeId={optionId(active)}
          onKeyDown={onKeyDown}
          above={opening ? OPENING : undefined}
          foot={whenItTakesEffect(conversation)}
        >
          {levels.map((level, index) => (
            <li
              key={level}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              aria-disabled={opening ? "true" : undefined}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(index)}
              className={optionClass({ active: index === active, current: index === current, disabled: opening })}
            >
              <span className="w-16 shrink-0">{level}</span>
              <span className="min-w-0 flex-1 truncate text-meta font-normal text-muted">{PI_DESCRIPTIONS[level] ?? ""}</span>
              {level === defaultLevel ? <span className="shrink-0 text-meta font-normal text-muted">default</span> : null}
            </li>
          ))}
        </HeaderList>
      ) : null}
    </div>
  );
}
