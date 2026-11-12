import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Api, clampThinkingLevel, getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type SessionEntry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { clampLevel, type ModelAndLevel, THINKING_LEVELS } from "@mirror-desktop/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyChoice,
  type ChoosableSession,
  credentialIsPis,
  fallbackLine,
  journeyStart,
  ModelNotAvailableError,
  modelsPiCanUse,
  type StartSettings,
  startingChoice,
  usableModel,
} from "./modelChoice.ts";

/** A model as Pi's catalog has it, with only the fields the rules read; the cast is the test's boundary with Pi's types. */
function model(provider: string, id: string, levels: { reasoning?: boolean; map?: Record<string, string | null> } = {}): Model<Api> {
  return { provider, id, name: id, reasoning: levels.reasoning ?? true, thinkingLevelMap: levels.map } as unknown as Model<Api>;
}

/** Off to high, as most models. */
const test = model("anthropic", "claude-test");
/** Low to max: no off, no minimal, as claude-sonnet-5-5. */
const deep = model("anthropic", "claude-deep", { map: { off: null, minimal: null, xhigh: "x", max: "m" } });
/** A model that does not reason. */
const plain = model("anthropic", "claude-plain", { reasoning: false });
/** A model whose provider has no credential. */
const distant = model("faraway", "far-1");
/** A model whose provider's only credential is in the host's environment, not Pi's own. */
const routed = model("openrouter", "anthropic/claude-test");

const catalog = {
  getModel: (provider: string, id: string) => [test, deep, plain, distant, routed].find((m) => m.provider === provider && m.id === id),
  hasConfiguredAuth: (provider: string) => provider === "anthropic" || provider === "openrouter",
  checkAuth: async (provider: string) => (provider === "anthropic" || provider === "openrouter" ? { ok: true } : undefined),
  getProviderAuthStatus: (provider: string) =>
    provider === "anthropic"
      ? { configured: true, source: "stored" }
      : provider === "openrouter"
        ? { configured: true, source: "environment", label: "OPENROUTER_API_KEY" }
        : { configured: false },
};

function settings(values: { provider?: string; model?: string; level?: string; perModel?: Record<string, string> } = {}): StartSettings {
  return {
    getDefaultProvider: () => values.provider,
    getDefaultModel: () => values.model,
    getDefaultThinkingLevel: () => values.level,
    getModelThinkingLevel: (provider, id) => values.perModel?.[`${provider}/${id}`],
  };
}

let next = 0;
/** An entry of a session's branch, with only the fields the rules read; the cast is the test's boundary with Pi's types. */
function entry(fields: Record<string, unknown>): SessionEntry {
  next += 1;
  return { id: `e${next}`, parentId: null, timestamp: "2026-11-07T09:00:00.000Z", ...fields } as unknown as SessionEntry;
}
const modelChange = (provider: string, modelId: string) => entry({ type: "model_change", provider, modelId });
const levelChange = (thinkingLevel: string) => entry({ type: "thinking_level_change", thinkingLevel });
const user = (text: string) => entry({ type: "message", message: { role: "user", content: text, timestamp: 1 } });
const answer = (provider: string, modelId: string) =>
  entry({ type: "message", message: { role: "assistant", content: [], provider, model: modelId, stopReason: "stop", timestamp: 2 } });

describe("what a new session starts with", () => {
  it("is the settings' default model, at the default level, clamped to what the model supports", () => {
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-test", level: "high" }), catalog)).toEqual({
      model: { provider: "anthropic", id: "claude-test" },
      thinkingLevel: "high",
    });
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-deep", level: "off" }), catalog)).toEqual({
      model: { provider: "anthropic", id: "claude-deep" },
      thinkingLevel: "low",
    });
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-test", level: "max" }), catalog)).toEqual({
      model: { provider: "anthropic", id: "claude-test" },
      thinkingLevel: "high",
    });
  });

  it("takes the model's own level from the settings over the default, and medium when the settings name none", () => {
    const perModel = { "anthropic/claude-test": "low" };
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-test", level: "high", perModel }), catalog).thinkingLevel).toBe("low");
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-test" }), catalog).thinkingLevel).toBe("medium");
  });

  it("gives a model that does not reason no thinking", () => {
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-plain", level: "high" }), catalog)).toEqual({
      model: { provider: "anthropic", id: "claude-plain" },
      thinkingLevel: "off",
    });
  });

  it("names no model when the settings name none Pi can use, since Pi then chooses one the host cannot name", () => {
    expect(startingChoice(settings({ level: "high" }), catalog)).toEqual({ thinkingLevel: "high" });
    expect(startingChoice(settings({ provider: "faraway", model: "far-1", level: "high" }), catalog)).toEqual({ thinkingLevel: "high" });
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-gone" }), catalog)).toEqual({ thinkingLevel: "medium" });
  });

  it("is also what a file with no messages starts with", () => {
    const branch = [modelChange("anthropic", "claude-deep"), levelChange("max")];
    expect(startingChoice(settings({ provider: "anthropic", model: "claude-test", level: "low" }), catalog, branch)).toEqual({
      model: { provider: "anthropic", id: "claude-test" },
      thinkingLevel: "low",
    });
  });
});

describe("what resuming a session starts with", () => {
  const defaults = settings({ provider: "anthropic", model: "claude-test", level: "medium", perModel: { "anthropic/claude-deep": "xhigh" } });

  it("is the branch's last model and level", () => {
    const branch = [modelChange("anthropic", "claude-test"), levelChange("low"), user("Hi"), answer("anthropic", "claude-test"), modelChange("anthropic", "claude-deep"), levelChange("high")];
    expect(startingChoice(defaults, catalog, branch)).toEqual({ model: { provider: "anthropic", id: "claude-deep" }, thinkingLevel: "high" });
  });

  it("takes the model of an answer that came after the last model change", () => {
    const branch = [modelChange("anthropic", "claude-test"), levelChange("high"), user("Hi"), answer("anthropic", "claude-deep")];
    expect(startingChoice(defaults, catalog, branch).model).toEqual({ provider: "anthropic", id: "claude-deep" });
  });

  it("takes the global default level when the file records none, and never the model's own setting", () => {
    const branch = [modelChange("anthropic", "claude-deep"), user("Hi"), answer("anthropic", "claude-deep")];
    expect(startingChoice(defaults, catalog, branch)).toEqual({ model: { provider: "anthropic", id: "claude-deep" }, thinkingLevel: "medium" });
  });

  it("clamps the recorded level to the model", () => {
    const branch = [modelChange("anthropic", "claude-deep"), levelChange("off"), user("Hi")];
    expect(startingChoice(defaults, catalog, branch).thinkingLevel).toBe("low");
  });

  it("falls back to the default model when Pi cannot use the recorded one, keeping the recorded level", () => {
    const branch = [modelChange("faraway", "far-1"), levelChange("high"), user("Hi"), answer("faraway", "far-1")];
    expect(startingChoice(defaults, catalog, branch)).toEqual({ model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "high" });
    const gone = [modelChange("anthropic", "claude-gone"), levelChange("low"), user("Hi")];
    expect(startingChoice(defaults, catalog, gone)).toEqual({ model: { provider: "anthropic", id: "claude-test" }, thinkingLevel: "low" });
  });
});

describe("a model the person chose", () => {
  it("is Pi's own model when Pi knows it and its provider has a credential", async () => {
    await expect(usableModel(catalog, { provider: "anthropic", id: "claude-deep" })).resolves.toBe(deep);
  });

  it("is refused in the host's words when Pi does not know it or has no credential for it", async () => {
    await expect(usableModel(catalog, { provider: "anthropic", id: "claude-gone" })).rejects.toThrow(
      new ModelNotAvailableError("Pi knows no model anthropic/claude-gone."),
    );
    await expect(usableModel(catalog, { provider: "faraway", id: "far-1" })).rejects.toThrow(
      new ModelNotAvailableError("No credential for faraway: sign in first."),
    );
  });

  it("is refused when the only credential for it is in the host's environment, not Pi's own", async () => {
    await expect(usableModel(catalog, { provider: "openrouter", id: "anthropic/claude-test" })).rejects.toThrow(
      new ModelNotAvailableError("Pi has no credential of its own for openrouter: sign in to it first."),
    );
  });

  it("is usable when Pi's own check finds a credential the quick one does not, as a prompt is", async () => {
    const refreshed = { ...catalog, hasConfiguredAuth: () => false, checkAuth: async () => ({ ok: true }) };
    await expect(usableModel(refreshed, { provider: "anthropic", id: "claude-test" })).resolves.toBe(test);
  });
});

/** An open Pi session as a choice reads it; its setModel moves the level by Pi's switch rule, to the settings' default, as Pi's does. */
function piSession(start: { model?: Model<Api>; level: string; defaultLevel?: string; refuse?: string }) {
  const calls: string[] = [];
  const recorded: string[] = [];
  /** Mutable, as Pi's session is: a ChoosableSession reads it through its readonly view. */
  const session: { -readonly [K in keyof ChoosableSession]: ChoosableSession[K] } & { options: unknown[] } = {
    model: start.model,
    thinkingLevel: start.level,
    options: [],
    async setModel(model: Model<Api>, ...options: unknown[]) {
      calls.push(`model ${model.provider}/${model.id}`);
      session.options.push(...options);
      if (start.refuse) throw new Error(start.refuse);
      session.model = model;
      recorded.push(`model_change ${model.id}`);
      session.setThinkingLevel(clampLevel(start.defaultLevel ?? "medium", getSupportedThinkingLevels(model)) as never);
    },
    setThinkingLevel(level, ...options: unknown[]) {
      calls.push(`level ${level}`);
      session.options.push(...options);
      const clamped = session.model ? clampThinkingLevel(session.model, level) : level;
      if (clamped !== session.thinkingLevel) recorded.push(`thinking_level_change ${clamped}`);
      session.thinkingLevel = clamped;
    },
  };
  return { session, calls, recorded };
}

describe("the models the person can pick", () => {
  it("are those whose credential is Pi's own, shared with terminal Pi: its store or its models.json", () => {
    expect(credentialIsPis({ configured: true, source: "stored" })).toBe(true);
    expect(credentialIsPis({ configured: true, source: "models_json_key" })).toBe(true);
    expect(credentialIsPis({ configured: true, source: "models_json_command" })).toBe(true);
    for (const source of ["environment", "runtime", "fallback"]) expect(credentialIsPis({ configured: true, source }), source).toBe(false);
    expect(credentialIsPis({ configured: false })).toBe(false);
    expect(modelsPiCanUse([test, routed, distant], catalog)).toEqual([test]);
  });

  it("leave out, against Pi itself, a provider signed in only by the host's environment", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mirror-desktop-own-"));
    const before = process.env.OPENROUTER_API_KEY;
    try {
      await writeFile(join(dir, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "not-a-key" } }));
      process.env.OPENROUTER_API_KEY = "not-a-key-either";
      const runtime = await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: join(dir, "models.json"), modelsStorePath: join(dir, "store.json") });
      const available = await runtime.getAvailable();
      expect(new Set(available.map((m) => m.provider))).toEqual(new Set(["anthropic", "openrouter"]));
      const listed = modelsPiCanUse(available, runtime);
      expect(new Set(listed.map((m) => m.provider))).toEqual(new Set(["anthropic"]));
      expect(listed.length).toBeGreaterThan(0);
      const routedModel = available.find((m) => m.provider === "openrouter");
      await expect(usableModel(runtime, { provider: "openrouter", id: routedModel?.id ?? "?" })).rejects.toBeInstanceOf(ModelNotAvailableError);
    } finally {
      if (before === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = before;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("a choice applied to an open session", () => {
  it("sets the model, then the level the person sees, so Pi's switch rule never has the last word", async () => {
    const { session, calls, recorded } = piSession({ model: test, level: "high" });
    const after = await applyChoice(session, { model: deep, thinkingLevel: "high" });
    expect(after).toEqual({ model: { provider: "anthropic", id: "claude-deep" }, thinkingLevel: "high" });
    expect(calls).toEqual(["model anthropic/claude-deep", "level medium", "level high"]);
    // Pi's interim entry is accepted: the file ends on the level the person sees.
    expect(recorded).toEqual(["model_change claude-deep", "thinking_level_change medium", "thinking_level_change high"]);
  });

  it("leaves the model alone when it is already the session's, and sets only the level", async () => {
    const { session, calls } = piSession({ model: test, level: "medium" });
    await expect(applyChoice(session, { model: test, thinkingLevel: "low" })).resolves.toEqual({
      model: { provider: "anthropic", id: "claude-test" },
      thinkingLevel: "low",
    });
    expect(calls).toEqual(["level low"]);
  });

  it("answers with the level Pi clamped, when the model lacks the one asked", async () => {
    const { session } = piSession({ model: test, level: "off" });
    await expect(applyChoice(session, { model: deep, thinkingLevel: "off" })).resolves.toEqual({
      model: { provider: "anthropic", id: "claude-deep" },
      thinkingLevel: "low",
    });
  });

  it("never asks Pi to persist anything to its settings", async () => {
    const { session } = piSession({ model: test, level: "medium" });
    await applyChoice(session, { model: deep, thinkingLevel: "high" });
    expect(session.options).toEqual([]);
  });

  it("says in the host's words a model Pi itself refused for want of a credential", async () => {
    const { session } = piSession({ model: test, level: "medium", refuse: "No API key for anthropic/claude-deep" });
    await expect(applyChoice(session, { model: deep, thinkingLevel: "high" })).rejects.toThrow(
      new ModelNotAvailableError("No credential for anthropic: sign in first."),
    );
  });

  it("lets any other failure of Pi's through as it is", async () => {
    const { session } = piSession({ model: test, level: "medium", refuse: "disk full" });
    await expect(applyChoice(session, { model: deep, thinkingLevel: "high" })).rejects.toThrow("disk full");
  });

  it("refuses a level Pi does not have before asking Pi anything", async () => {
    const { session, calls } = piSession({ model: test, level: "medium" });
    await expect(applyChoice(session, { thinkingLevel: "turbo" })).rejects.toThrow(new ModelNotAvailableError('Pi has no thinking level "turbo".'));
    expect(calls).toEqual([]);
  });
});

describe("Pi's fallback line, where a session begins", () => {
  it("keeps Pi's words when the file's model could not be restored and nothing was picked over it", () => {
    const words = "Could not restore model faraway/far-1. Using anthropic/claude-test";
    expect(fallbackLine(words, false)).toBe(words);
    expect(fallbackLine(words, true)).toBeUndefined();
    expect(fallbackLine(undefined, false)).toBeUndefined();
  });

  it("says in the host's words that no model is available, since Pi's carry paths", () => {
    const words = "No models available. Use /login to log into a provider via OAuth or API key. See:\n  /Users/test/docs/providers.md";
    expect(fallbackLine(words, false)).toBe("No model is available: sign in first.");
  });
});

describe("one clamp, Pi's", () => {
  let runtime: ModelRuntime;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "mirror-desktop-levels-"));
    runtime = await ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"), modelsStorePath: join(root, "store.json") });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keeps Pi's level order", () => {
    const everyLevel = model("x", "every", { map: { xhigh: "x", max: "m" } });
    expect(getSupportedThinkingLevels(everyLevel)).toEqual([...THINKING_LEVELS]);
  });

  it("agrees with pi-ai's clampThinkingLevel for every model Pi knows and every level", () => {
    const models = runtime.getModels();
    expect(models.length).toBeGreaterThan(100);
    for (const known of models) {
      for (const level of [...THINKING_LEVELS, "turbo"]) {
        expect(clampLevel(level, getSupportedThinkingLevels(known)), `${known.provider}/${known.id} at ${level}`).toBe(
          clampThinkingLevel(known, level as never),
        );
      }
    }
  });
});

// The host reproduces Pi's start rule, which Pi does not export. This runs
// the same cases through Pi's own createAgentSession, hermetically: a temp
// agent dir, Pi's bundled catalog, a runtime key Pi never sends anywhere, no
// extensions, nothing on the network. Re-run at every Pi upgrade.
describe("the start rule, against Pi's own", () => {
  let root: string;
  let agentDir: string;
  let cwd: string;
  let runtime: ModelRuntime;
  let opened = 0;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "mirror-desktop-parity-"));
    agentDir = join(root, "agent");
    cwd = join(root, "project");
    await mkdir(agentDir, { recursive: true });
    await mkdir(cwd, { recursive: true });
    runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "store.json") });
    await runtime.setRuntimeApiKey("anthropic", "not-a-key");
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function withSettings(values: Record<string, unknown>): Promise<SettingsManager> {
    await writeFile(join(agentDir, "settings.json"), JSON.stringify(values));
    return SettingsManager.create(cwd, agentDir);
  }

  /** A session file holding `entries` after its header, each the child of the one before. */
  async function sessionFile(entries: Record<string, unknown>[]): Promise<string> {
    opened += 1;
    const file = join(root, `session-${opened}.jsonl`);
    let parentId: string | null = null;
    const lines = [{ type: "session", version: 3, id: `s${opened}`, timestamp: "2026-11-07T09:00:00.000Z", cwd }];
    entries.forEach((fields, index) => {
      const id = `e${opened}-${index}`;
      lines.push({ id, parentId, timestamp: "2026-11-07T09:00:00.000Z", ...fields } as never);
      parentId = id;
    });
    await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
    return file;
  }

  /** What Pi itself starts the session on. */
  async function piStarts(settingsManager: SettingsManager, sessionManager: SessionManager): Promise<ModelAndLevel> {
    const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, settingsManager, resourceLoader, sessionManager });
    try {
      const started = session.model;
      return { ...(started ? { model: { provider: started.provider, id: started.id } } : {}), thinkingLevel: session.thinkingLevel };
    } finally {
      session.dispose();
    }
  }

  const userLine = { type: "message", message: { role: "user", content: [{ type: "text", text: "Hi" }], timestamp: 1 } };
  const answerLine = (id: string) => ({
    type: "message",
    message: { role: "assistant", content: [{ type: "text", text: "Hello" }], provider: "anthropic", model: id, api: "anthropic-messages", usage: {}, stopReason: "stop", timestamp: 2 },
  });

  it("agrees for a new session, in each branch Pi can name", async () => {
    for (const values of [
      { defaultProvider: "anthropic", defaultModel: "claude-haiku-4-5", defaultThinkingLevel: "high" },
      { defaultProvider: "anthropic", defaultModel: "claude-haiku-4-5", defaultThinkingLevel: "high", modelThinkingLevels: { "anthropic/claude-haiku-4-5": "low" } },
      { defaultProvider: "anthropic", defaultModel: "claude-haiku-4-5", defaultThinkingLevel: "max" },
      { defaultProvider: "anthropic", defaultModel: "claude-sonnet-5-5", defaultThinkingLevel: "off" },
      { defaultProvider: "anthropic", defaultModel: "claude-sonnet-5-5" },
    ]) {
      const settingsManager = await withSettings(values);
      const ours = startingChoice(settingsManager, runtime);
      expect(ours.model, JSON.stringify(values)).toBeDefined();
      expect(ours, JSON.stringify(values)).toEqual(await piStarts(settingsManager, SessionManager.inMemory(cwd)));
    }
  });

  it("names no model where Pi picks one by its own table, and Pi does pick one", async () => {
    const settingsManager = await withSettings({ defaultProvider: "openai-codex", defaultModel: "gpt-6-luna", defaultThinkingLevel: "low" });
    expect(startingChoice(settingsManager, runtime)).toEqual({ thinkingLevel: "low" });
    expect((await piStarts(settingsManager, SessionManager.inMemory(cwd))).model).toBeDefined();
  });

  it("agrees for a resumed session, in each branch Pi can name", async () => {
    const settingsManager = await withSettings({
      defaultProvider: "anthropic",
      defaultModel: "claude-haiku-4-5",
      defaultThinkingLevel: "medium",
      modelThinkingLevels: { "anthropic/claude-sonnet-5-5": "xhigh" },
    });
    for (const entries of [
      [{ type: "model_change", provider: "anthropic", modelId: "claude-sonnet-5-5" }, { type: "thinking_level_change", thinkingLevel: "high" }, userLine, answerLine("claude-sonnet-5-5")],
      [{ type: "model_change", provider: "anthropic", modelId: "claude-sonnet-5-5" }, userLine, answerLine("claude-sonnet-5-5")],
      [{ type: "model_change", provider: "anthropic", modelId: "claude-sonnet-5-5" }, { type: "thinking_level_change", thinkingLevel: "off" }, userLine],
      [{ type: "model_change", provider: "anthropic", modelId: "claude-haiku-4-5" }, { type: "thinking_level_change", thinkingLevel: "low" }, userLine, answerLine("claude-sonnet-5-5")],
      [{ type: "model_change", provider: "openai-codex", modelId: "gpt-6-luna" }, { type: "thinking_level_change", thinkingLevel: "max" }, userLine],
    ]) {
      const file = await sessionFile(entries);
      const ours = startingChoice(settingsManager, runtime, SessionManager.open(file, undefined, cwd).getBranch());
      expect(ours, JSON.stringify(entries)).toEqual(await piStarts(settingsManager, SessionManager.open(file, undefined, cwd)));
    }
  });

  it("reads Pi's settings for a Journey's defaults without writing them", async () => {
    const values = { defaultProvider: "anthropic", defaultModel: "claude-haiku-4-5", defaultThinkingLevel: "low" };
    await withSettings(values);
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({ defaultThinkingLevel: "high" }));
    const before = await Promise.all([join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")].map(async (path) => [await readFile(path, "utf8"), (await stat(path)).mtimeMs]));

    // The project's settings over the global ones, as Pi reads them at open.
    expect(journeyStart(cwd, runtime, undefined, agentDir)).toEqual({ model: { provider: "anthropic", id: "claude-haiku-4-5" }, thinkingLevel: "high" });

    const after = await Promise.all([join(agentDir, "settings.json"), join(cwd, ".pi", "settings.json")].map(async (path) => [await readFile(path, "utf8"), (await stat(path)).mtimeMs]));
    expect(after).toEqual(before);
  });
});
