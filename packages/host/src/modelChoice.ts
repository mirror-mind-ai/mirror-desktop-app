// A session's model and thinking level: what it starts with, and what the
// person chooses (CV1.DS2.US3).
//
// What a session starts with is Pi's rule, read from Pi 1.4.0's
// `createAgentSession` (core/sdk.js) and `findInitialModel`, which Pi does
// not export, so the header can say it before anything opens:
//
// - a new session starts on the settings' default model when Pi knows it and
//   its provider has a credential; otherwise Pi picks one by a table of its
//   own, which the host cannot name, so the model is left unsaid. Its level
//   is the model's own setting, else the default level, else medium,
//   clamped to what the model supports;
// - a resumed session starts on its branch's last model (a model change, or
//   a later answer's model) when Pi can still use it, else on the default.
//   Its level is the branch's last level when the branch records one, else
//   the default level, never the model's own setting; clamped as above. A
//   file with no messages starts as a new session does.
//
// The settings are the global ones under the project's, as the open reads
// them, and reading them writes nothing. The rule is a copy of Pi's: a test
// runs the same cases through Pi's own createAgentSession, so a Pi upgrade
// that changes it fails there.
//
// What the person chooses is applied as terminal Pi's `/model` and
// `/thinking` apply it: for the session only, recorded in its file, never in
// Pi's settings. Pi's setModel moves the level by its own switch rule (the
// model's setting, else the default) before anything else happens, so the
// level the person sees is set after it, always; Pi records a level only
// when it changes, and the interim one its switch rule wrote stays in the
// file, accepted.

import { type Api, getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { getAgentDir, type SessionEntry, sessionEntryToContextMessages, SettingsManager } from "@earendil-works/pi-coding-agent";
import { clampLevel, type ModelAndLevel, type ModelRef, THINKING_LEVELS } from "@mirror-desktop/protocol";

/** A model Pi does not know or has no credential for, or a level Pi does not have, in the host's words. */
export class ModelNotAvailableError extends Error {
  override readonly name = "ModelNotAvailableError";
}

/** Pi's thinking levels, the same union as Pi's own `ThinkingLevel`. */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Pi's default level when its settings name none (`DEFAULT_THINKING_LEVEL`, core/defaults.js, not exported). */
const PI_DEFAULT_LEVEL = "medium";

/** What Pi's start rule reads of Pi's settings; Pi's SettingsManager is one. */
export interface StartSettings {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
  getDefaultThinkingLevel(): string | undefined;
  getModelThinkingLevel(provider: string, modelId: string): string | undefined;
}

/** The models Pi knows and whether a provider has a credential; Pi's ModelRuntime is one. */
export interface ModelCatalog {
  getModel(provider: string, modelId: string): Model<Api> | undefined;
  hasConfiguredAuth(provider: string): boolean;
}

/** The catalog with Pi's full credential check, which may refresh a token; Pi's ModelRuntime is one. */
export interface CredentialCatalog extends ModelCatalog {
  checkAuth(provider: string): Promise<unknown>;
}

/** What a choice reads and changes of an open Pi session; Pi's AgentSession is one. */
export interface ChoosableSession {
  readonly model: Model<Api> | undefined;
  readonly thinkingLevel: string;
  setModel(model: Model<Api>): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
}

/** What a session starts with: `branch` is a resumed file's, absent for a new session. */
export function startingChoice(settings: StartSettings, catalog: ModelCatalog, branch?: readonly SessionEntry[]): ModelAndLevel {
  // Pi resumes a file only when it holds something its context would carry.
  const resumed = branch !== undefined && branch.some((entry) => sessionEntryToContextMessages(entry).length > 0);
  if (!resumed) {
    const model = defaultModel(settings, catalog);
    const level = (model && settings.getModelThinkingLevel(model.provider, model.id)) ?? settings.getDefaultThinkingLevel() ?? PI_DEFAULT_LEVEL;
    return choice(model, level);
  }
  const recorded = recordedModel(branch);
  const model = (recorded && usableNow(catalog, recorded.provider, recorded.modelId)) ?? defaultModel(settings, catalog);
  const level = recordedLevel(branch) ?? settings.getDefaultThinkingLevel() ?? PI_DEFAULT_LEVEL;
  return choice(model, level);
}

/**
 * What a session in the Journey's project starts with, from Pi's settings as
 * the open reads them: a new one, or the resumed file whose `branch` is
 * given. Reads only.
 */
export function journeyStart(cwd: string, catalog: ModelCatalog, branch?: readonly SessionEntry[], agentDir: string = getAgentDir()): ModelAndLevel {
  return startingChoice(SettingsManager.create(cwd, agentDir), catalog, branch);
}

/** Whether the provider has a credential Pi can use, as Pi checks it before a run: the quick check, else the full one. */
export async function hasCredential(catalog: CredentialCatalog, provider: string): Promise<boolean> {
  return catalog.hasConfiguredAuth(provider) || (await catalog.checkAuth(provider)) !== undefined;
}

/** Pi's own model for `ref`, or a refusal in the host's words when Pi does not know it or has no credential for it. */
export async function usableModel(catalog: CredentialCatalog, ref: ModelRef): Promise<Model<Api>> {
  const model = catalog.getModel(ref.provider, ref.id);
  if (!model) throw new ModelNotAvailableError(`Pi knows no model ${ref.provider}/${ref.id}.`);
  if (!(await hasCredential(catalog, ref.provider))) throw new ModelNotAvailableError(`No credential for ${ref.provider}: sign in first.`);
  return model;
}

/** `level` as one of Pi's levels, or a refusal in the host's words. */
export function piLevel(level: string): ThinkingLevel {
  const known = THINKING_LEVELS.find((candidate) => candidate === level);
  if (!known) throw new ModelNotAvailableError(`Pi has no thinking level "${level}".`);
  return known;
}

/**
 * Apply the person's choice to an open session and answer what it runs on
 * after: the model when it differs, then the level, always, since Pi's
 * setModel has moved it by Pi's own rule. Never persisted to Pi's settings.
 */
export async function applyChoice(session: ChoosableSession, choice: { model?: Model<Api>; thinkingLevel?: string }): Promise<ModelAndLevel> {
  const level = choice.thinkingLevel === undefined ? undefined : piLevel(choice.thinkingLevel);
  const model = choice.model;
  if (model && !sameModel(session.model, model)) {
    try {
      await session.setModel(model);
    } catch (cause) {
      // Pi's own refusal, when the credential went between the host's check and Pi's.
      if (cause instanceof Error && cause.message.startsWith("No API key for")) {
        throw new ModelNotAvailableError(`No credential for ${model.provider}: sign in first.`, { cause });
      }
      throw cause;
    }
  }
  if (level !== undefined) session.setThinkingLevel(level);
  return runsOn(session);
}

/** What the session runs on now. */
export function runsOn(session: Pick<ChoosableSession, "model" | "thinkingLevel">): ModelAndLevel {
  const model = session.model;
  return { ...(model ? { model: { provider: model.provider, id: model.id } } : {}), thinkingLevel: session.thinkingLevel };
}

/**
 * The line the transcript shows where a session begins when Pi could not
 * restore its file's model: Pi's own words when nothing was picked over that
 * model; none when something was; the host's own when Pi found no model at
 * all, since Pi's words for that carry paths.
 */
export function fallbackLine(message: string | undefined, picked: boolean): string | undefined {
  if (message === undefined) return undefined;
  if (message.startsWith("Could not restore model")) return picked ? undefined : message;
  return "No model is available: sign in first.";
}

function defaultModel(settings: StartSettings, catalog: ModelCatalog): Model<Api> | undefined {
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  return provider && id ? usableNow(catalog, provider, id) : undefined;
}

function usableNow(catalog: ModelCatalog, provider: string, id: string): Model<Api> | undefined {
  const model = catalog.getModel(provider, id);
  return model && catalog.hasConfiguredAuth(model.provider) ? model : undefined;
}

/** The branch's last model: its last model change, or an answer's model after it. */
function recordedModel(branch: readonly SessionEntry[]): { provider: string; modelId: string } | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "model_change") return { provider: entry.provider, modelId: entry.modelId };
    if (entry?.type === "message" && entry.message.role === "assistant") return { provider: entry.message.provider, modelId: entry.message.model };
  }
  return undefined;
}

/** The branch's last level, when it records one. */
function recordedLevel(branch: readonly SessionEntry[]): string | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "thinking_level_change") return entry.thinkingLevel;
  }
  return undefined;
}

function choice(model: Model<Api> | undefined, level: string): ModelAndLevel {
  if (!model) return { thinkingLevel: level };
  return { model: { provider: model.provider, id: model.id }, thinkingLevel: clampLevel(level, getSupportedThinkingLevels(model)) };
}

function sameModel(a: Model<Api> | undefined, b: Model<Api>): boolean {
  return a !== undefined && a.provider === b.provider && a.id === b.id;
}
