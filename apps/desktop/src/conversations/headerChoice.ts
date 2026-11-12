// What the conversation's header says a session runs on, and what a pick
// makes of it (CV1.DS2.US3).
//
// The header always says what the session shown will run on next. For the
// open session, that is the session's own, as the host last answered. For a
// session not open, it is the person's held pick when there is one, else
// what resuming the file starts with (read with it), or, for a new session,
// the Journey's defaults (read with its list). Until what is shown has been
// read, it is unknown, and the header says so.
//
// A pick is always a model and its level, since Pi would otherwise move the
// level by its own rule: picking a model keeps the level shown when the
// model has it, else moves it to the nearest level the model has, by Pi's
// clamp, and says so; picking a level keeps the model, and is no pick while
// the model is one Pi will choose at start.
//
// Pure, beside liveTurn.ts: the store applies it.

import { type AvailableModel, clampLevel, type ModelAndLevel, type ModelRef } from "@mirror-desktop/protocol";

/** Where what the header shows comes from. */
export type ChoiceSource = "session" | "pick" | "file" | "defaults";

export interface HeaderChoice extends ModelAndLevel {
  readonly source: ChoiceSource;
}

/** A model and its level the person picked for the session shown, before its first send. */
export interface ModelPick {
  readonly model: ModelRef;
  readonly thinkingLevel: string;
}

/** A level that moved because the model picked lacks the one shown. */
export interface MovedLevel {
  readonly from: string;
  readonly to: string;
}

/** What the rules read of a conversation; the store's Conversation is one. */
export interface Shows {
  readonly session?: { readonly file: string; readonly model?: ModelRef; readonly thinkingLevel: string };
  readonly shown: { readonly kind: "file"; readonly file: string } | { readonly kind: "new" };
  readonly pick?: ModelPick;
  readonly resumes?: ModelAndLevel;
  readonly sessions?: { readonly defaults?: ModelAndLevel };
}

/** What the header says the session shown runs on next, and where that comes from; undefined while unknown. */
export function shownChoice(conversation: Shows | undefined): HeaderChoice | undefined {
  if (!conversation) return undefined;
  const { session, shown } = conversation;
  if (session && shown.kind === "file" && shown.file === session.file) {
    return { ...(session.model ? { model: session.model } : {}), thinkingLevel: session.thinkingLevel, source: "session" };
  }
  if (conversation.pick) return { ...conversation.pick, source: "pick" };
  const read = shown.kind === "file" ? conversation.resumes : conversation.sessions?.defaults;
  return read ? { ...read, source: shown.kind === "file" ? "file" : "defaults" } : undefined;
}

/** The pick a model makes of what the header shows: the level, kept when the model has it, else moved to the nearest it has. */
export function pickModel(shown: HeaderChoice, model: AvailableModel): { pick: ModelPick; moved?: MovedLevel } {
  const thinkingLevel = clampLevel(shown.thinkingLevel, model.thinkingLevels);
  const pick = { model: { provider: model.provider, id: model.id }, thinkingLevel };
  return thinkingLevel === shown.thinkingLevel ? { pick } : { pick, moved: { from: shown.thinkingLevel, to: thinkingLevel } };
}

/** The pick a level makes of what the header shows: the model, at that level; none while the model is one Pi will choose. */
export function pickLevel(shown: HeaderChoice, thinkingLevel: string): ModelPick | undefined {
  return shown.model ? { model: shown.model, thinkingLevel } : undefined;
}

export function sameChoice(a: ModelAndLevel | undefined, b: ModelAndLevel | undefined): boolean {
  return a !== undefined && b !== undefined && a.thinkingLevel === b.thinkingLevel && a.model?.provider === b.model?.provider && a.model?.id === b.model?.id;
}

/** A model as Pi's `/model` names it. */
export function modelLabel(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

/** The levels Pi supports for `model`, when it is one Pi can use now. */
export function levelsOf(model: ModelRef | undefined, models: readonly AvailableModel[]): readonly string[] | undefined {
  if (!model) return undefined;
  return models.find((candidate) => candidate.provider === model.provider && candidate.id === model.id)?.thinkingLevels;
}

/** What the screen says when a model pick moved the level. */
export function movedLevelLine(model: ModelRef, moved: MovedLevel): string {
  return `${model.id} has no ${moved.from}; thinking is now ${moved.to}.`;
}

/**
 * The models whose `provider/id` or name hold every word of `query`, in
 * Pi's order, case aside; all of them for an empty query. The list's filter,
 * for a machine where Pi can use hundreds of models.
 */
export function filterModels(models: readonly AvailableModel[], query: string): readonly AvailableModel[] {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return models;
  return models.filter((model) => {
    const text = `${model.provider}/${model.id} ${model.name}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
