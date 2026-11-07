import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { modelLabel, movedLevelLine, shownChoice } from "../conversations/headerChoice.ts";
import { chooseModel, type Conversation } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { readModels, useHost } from "../host/store.ts";
import { HEADER_CONTROL } from "./buttons.ts";
import { HeaderList, OPENING, optionClass, whenItTakesEffect } from "./HeaderList.tsx";
import { Pulse } from "./Pulse.tsx";
import { useListbox } from "./useListbox.ts";

/**
 * The model the session shown runs on next, in the conversation's header
 * (CV1.DS2.US3), and the list of the models Pi can use now that it opens:
 * each by its id with its provider beside it, as Pi's `/model` lists them,
 * Pi's default marked; reading the list again when it opens, as the
 * sessions list does.
 *
 * Its name is `provider/id`; "Pi's default" when Pi's settings name no
 * model Pi can use, which Pi then chooses at start. When the header
 * narrows, the name gives way from its start, the provider first, so the
 * end of the id, which tells models apart, stays. A pick held for the first send is drawn in ink,
 * and in the danger color while it is the model the last open refused.
 * While a change waits on the host, it is busy and takes no pick; while the
 * session opens, its list shows what was picked and takes none.
 *
 * A pick that moves the level, because the model lacks it, is said once,
 * as a toast, in the register of the composer's other one-off lines; a
 * refused change is said the same way, in the host's words.
 */
export function ModelControl({ journeyId, conversation }: { journeyId: string; conversation: Conversation | undefined }) {
  const client = useHost((state) => state.client);
  const models = useHost((state) => state.models);
  const shown = shownChoice(conversation);
  const opening = conversation?.status === "opening";
  const busy = conversation?.configuring === true;
  const current = shown?.model ? models.findIndex((model) => model.provider === shown.model?.provider && model.id === shown.model.id) : -1;
  const defaultModel = conversation?.sessions?.defaults?.model;

  const { open, active, setActive, wrapper, button, listbox, optionId, show, close, dismiss, onKeyDown } = useListbox({
    count: models.length,
    onPick: pick,
  });

  function showList(): void {
    show(Math.max(current, 0));
    if (client) void readModels(client);
  }

  function pick(index: number): void {
    const model = models[index];
    if (!model || opening || !client) return;
    close();
    chooseModel(client, journeyId, model).then(
      (moved) => {
        if (moved) toast(movedLevelLine(model, moved));
      },
      (error: unknown) => toast.error(failureOf(error).message),
    );
  }

  if (!shown) {
    return (
      <button type="button" disabled aria-label="Model: reading…" className={`${HEADER_CONTROL} shrink-0 text-dim`}>
        …
      </button>
    );
  }

  const name = shown.model ? modelLabel(shown.model) : "Pi's default";
  const refused = shown.source === "pick" && conversation?.refusedModel !== undefined && shown.model !== undefined && modelLabel(conversation.refusedModel) === name;
  const color = refused ? "text-danger" : shown.source === "pick" ? "text-ink" : "text-muted";

  return (
    <div ref={wrapper} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-label={`Model: ${name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy}
        disabled={busy}
        title={name}
        onClick={() => (open ? dismiss() : showList())}
        className={`${HEADER_CONTROL} ${color}`}
      >
        {/* Cut from the start: right to left outside, the name isolated left to right inside. */}
        <span className="min-w-0 truncate [direction:rtl]">
          <bdi>{name}</bdi>
        </span>
        {busy ? <Pulse /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />}
      </button>
      {open ? (
        <HeaderList
          label="Models"
          listbox={listbox}
          activeId={optionId(active)}
          onKeyDown={onKeyDown}
          above={opening ? OPENING : undefined}
          foot={whenItTakesEffect(conversation)}
        >
          {models.map((model, index) => {
            const isDefault = defaultModel?.provider === model.provider && defaultModel.id === model.id;
            return (
              <li
                key={`${model.provider}/${model.id}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === current}
                aria-disabled={opening ? "true" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
                className={optionClass({ active: index === active, current: index === current, disabled: opening })}
              >
                <span className="min-w-0 flex-1 truncate">{model.id}</span>
                <span className="shrink-0 text-meta font-normal text-muted">{model.provider}</span>
                {isDefault ? <span className="shrink-0 text-meta font-normal text-muted">default</span> : null}
              </li>
            );
          })}
        </HeaderList>
      ) : null}
    </div>
  );
}
