import { useId, useState } from "react";
import { toast } from "sonner";

import { filterModels, modelLabel, movedLevelLine, shownChoice, whenItTakesEffect } from "../conversations/headerChoice.ts";
import { chooseModel, type Conversation } from "../conversations/store.ts";
import { failureOf } from "../host/client.ts";
import { readModels, useHost } from "../host/store.ts";
import { ControlButton, ControlPlaceholder, HeaderList, OPENING, optionClass } from "./HeaderList.tsx";
import { useListbox } from "./useListbox.ts";

/**
 * The model the session shown runs on next, in the conversation's header
 * (CV1.DS2.US3), and the list of the models Pi can use now that it opens:
 * each by its id with its provider beside it, as Pi's `/model` lists them,
 * Pi's default marked; reading the list again when it opens, as the
 * sessions list does. A filter field above the options takes the focus,
 * as the search line of Pi's `/model` does: a machine can have hundreds of
 * models (Mirror's configuration signs OpenRouter in with four hundred).
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
  const [query, setQuery] = useState("");
  const listed = filterModels(models, query);
  const current = shown?.model ? listed.findIndex((model) => model.provider === shown.model?.provider && model.id === shown.model.id) : -1;
  const defaultModel = conversation?.sessions?.defaults?.model;
  const listId = useId();

  const { open, active, setActive, wrapper, button, listbox, field, optionId, show, close, dismiss, onKeyDown, onFieldKeyDown } = useListbox({
    count: listed.length,
    onPick: pick,
  });

  function showList(): void {
    setQuery("");
    const all = shown?.model ? models.findIndex((model) => model.provider === shown.model?.provider && model.id === shown.model.id) : -1;
    show(Math.max(all, 0));
    if (client) void readModels(client);
  }

  function pick(index: number): void {
    const model = listed[index];
    if (!model || opening || !client) return;
    close();
    chooseModel(client, journeyId, model).then(
      (moved) => {
        if (moved) toast(movedLevelLine(model, moved));
      },
      (error: unknown) => toast.error(failureOf(error).message),
    );
  }

  if (!shown) return <ControlPlaceholder what="Model" />;

  const name = shown.model ? modelLabel(shown.model) : "Pi's default";
  const refused = shown.source === "pick" && conversation?.refusedModel !== undefined && shown.model !== undefined && modelLabel(conversation.refusedModel) === name;
  const color = refused ? "text-danger" : shown.source === "pick" ? "text-ink" : "text-muted";

  return (
    <div ref={wrapper} className="relative min-w-0">
      <ControlButton what="Model" value={name} open={open} busy={busy} color={color} title={name} button={button} onOpen={showList} onDismiss={dismiss}>
        {/* Cut from the start: right to left outside, the name isolated left to right inside. */}
        <span className="min-w-0 truncate [direction:rtl]">
          <bdi>{name}</bdi>
        </span>
      </ControlButton>
      {open ? (
        <HeaderList
          label="Models"
          listId={listId}
          filter={
            <input
              ref={field}
              type="text"
              role="combobox"
              aria-label="Filter models"
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={listed.length > 0 ? optionId(active) : undefined}
              placeholder="Type to filter"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onFieldKeyDown}
              className="mx-2 mb-1 rounded-control border border-hairline bg-canvas px-2 py-1 text-ui text-ink outline-none placeholder:text-dim focus:border-focus"
            />
          }
          listbox={listbox}
          activeId={optionId(active)}
          onKeyDown={onKeyDown}
          above={opening ? OPENING : undefined}
          foot={whenItTakesEffect(shown, conversation?.running === true)}
        >
          {listed.length === 0 ? (
            <li role="none" className="px-3 py-1.5 text-ui text-muted">
              No model matches.
            </li>
          ) : null}
          {listed.map((model, index) => {
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
