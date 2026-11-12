import type { AvailableModel } from "@mirror-desktop/protocol";
import { describe, expect, it } from "vitest";

import { filterModels, levelsOf, modelLabel, whenItTakesEffect, movedLevelLine, pickLevel, pickModel, type Shows, shownChoice } from "./headerChoice.ts";

const test = { provider: "anthropic", id: "claude-test" };
const deep = { provider: "anthropic", id: "claude-deep" };
const testModel: AvailableModel = { ...test, name: "Claude Test", reasoning: true, thinkingLevels: ["off", "minimal", "low", "medium", "high"] };
const deepModel: AvailableModel = { ...deep, name: "Claude Deep", reasoning: true, thinkingLevels: ["low", "medium", "high", "xhigh", "max"] };
const file = "/Users/test/.pi/agent/sessions/--Users-test-garden--/tomatoes.jsonl";

const showing = (fields: Partial<Shows>): Shows => ({ shown: { kind: "new" }, ...fields });

describe("what the header says a session runs on", () => {
  it("is the open session's own, when the session shown is the open one", () => {
    const conversation = showing({
      shown: { kind: "file", file },
      session: { file, model: deep, thinkingLevel: "high" },
      resumes: { model: test, thinkingLevel: "low" },
    });
    expect(shownChoice(conversation)).toEqual({ model: deep, thinkingLevel: "high", source: "session" });
  });

  it("is what resuming the file shown starts with, while it is not open", () => {
    const conversation = showing({
      shown: { kind: "file", file },
      session: { file: "/Users/test/.pi/agent/sessions/other.jsonl", model: deep, thinkingLevel: "high" },
      resumes: { model: test, thinkingLevel: "low" },
    });
    expect(shownChoice(conversation)).toEqual({ model: test, thinkingLevel: "low", source: "file" });
  });

  it("is the Journey's defaults for a new session", () => {
    expect(shownChoice(showing({ sessions: { defaults: { model: test, thinkingLevel: "medium" } } }))).toEqual({
      model: test,
      thinkingLevel: "medium",
      source: "defaults",
    });
    expect(shownChoice(showing({ sessions: { defaults: { thinkingLevel: "medium" } } }))).toEqual({ thinkingLevel: "medium", source: "defaults" });
  });

  it("is the person's held pick over a file or the defaults", () => {
    const pick = { model: deep, thinkingLevel: "max" };
    expect(shownChoice(showing({ pick, sessions: { defaults: { model: test, thinkingLevel: "medium" } } }))).toEqual({ ...pick, source: "pick" });
    expect(shownChoice(showing({ pick, shown: { kind: "file", file }, resumes: { model: test, thinkingLevel: "low" } }))).toEqual({ ...pick, source: "pick" });
  });

  it("is unknown until what is shown has been read", () => {
    expect(shownChoice(undefined)).toBeUndefined();
    expect(shownChoice(showing({}))).toBeUndefined();
    expect(shownChoice(showing({ shown: { kind: "file", file }, sessions: { defaults: { model: test, thinkingLevel: "medium" } } }))).toBeUndefined();
  });
});

describe("a pick", () => {
  it("of a model keeps the level when the model has it, and says nothing moved", () => {
    expect(pickModel({ model: test, thinkingLevel: "high", source: "defaults" }, deepModel)).toEqual({ pick: { model: deep, thinkingLevel: "high" } });
  });

  it("of a model moves the level to the nearest the model has, and says from what to what", () => {
    expect(pickModel({ model: test, thinkingLevel: "off", source: "file" }, deepModel)).toEqual({
      pick: { model: deep, thinkingLevel: "low" },
      moved: { from: "off", to: "low" },
    });
    expect(pickModel({ model: deep, thinkingLevel: "max", source: "session" }, testModel)).toEqual({
      pick: { model: test, thinkingLevel: "high" },
      moved: { from: "max", to: "high" },
    });
  });

  it("of a model where Pi's default is unnamed takes the default level, clamped", () => {
    expect(pickModel({ thinkingLevel: "minimal", source: "defaults" }, deepModel)).toEqual({
      pick: { model: deep, thinkingLevel: "low" },
      moved: { from: "minimal", to: "low" },
    });
  });

  it("of a level keeps the model, and is no pick while the model is unnamed", () => {
    expect(pickLevel({ model: test, thinkingLevel: "medium", source: "defaults" }, "low")).toEqual({ model: test, thinkingLevel: "low" });
    expect(pickLevel({ thinkingLevel: "medium", source: "defaults" }, "low")).toBeUndefined();
  });
});

describe("the header's words", () => {
  it("names a model by provider and id, as Pi's /model does", () => {
    expect(modelLabel(test)).toBe("anthropic/claude-test");
  });

  it("finds a model's levels among the models Pi can use, and none for one it cannot", () => {
    expect(levelsOf(deep, [testModel, deepModel])).toEqual(deepModel.thinkingLevels);
    expect(levelsOf({ provider: "faraway", id: "far-1" }, [testModel, deepModel])).toBeUndefined();
    expect(levelsOf(undefined, [testModel])).toBeUndefined();
  });

  it("says where a level moved because the model lacked it", () => {
    expect(movedLevelLine(deep, { from: "off", to: "low" })).toBe("claude-deep has no off; thinking is now low.");
  });
});

describe("the model list's filter", () => {
  const routed: AvailableModel = { provider: "openrouter", id: "anthropic/claude-sonnet-4", name: "Anthropic: Claude Sonnet 4", reasoning: true, thinkingLevels: ["off", "low", "medium", "high"] };
  const models = [testModel, deepModel, routed];

  it("keeps every model for an empty query, in Pi's order", () => {
    expect(filterModels(models, "")).toEqual(models);
    expect(filterModels(models, "   ")).toEqual(models);
  });

  it("keeps the models whose provider/id or name hold every word, case aside", () => {
    expect(filterModels(models, "DEEP")).toEqual([deepModel]);
    expect(filterModels(models, "openrouter sonnet")).toEqual([routed]);
    expect(filterModels(models, "anthropic/claude")).toEqual([testModel, deepModel, routed]);
    expect(filterModels(models, "claude test")).toEqual([testModel]);
    expect(filterModels(models, "gpt")).toEqual([]);
  });
});

describe("when a pick takes effect, said at a list's foot", () => {
  it("is the first message for a session not open yet", () => {
    for (const source of ["pick", "file", "defaults"] as const) {
      expect(whenItTakesEffect({ thinkingLevel: "medium", source }, false)).toBe("Takes effect with your first message.");
    }
  });

  it("is Pi's next request while a turn runs, and at once, unsaid, for an idle open session", () => {
    expect(whenItTakesEffect({ thinkingLevel: "medium", source: "session" }, true)).toBe("Pi takes it at its next request in this run, or at your next message.");
    expect(whenItTakesEffect({ thinkingLevel: "medium", source: "session" }, false)).toBeUndefined();
    expect(whenItTakesEffect(undefined, false)).toBeUndefined();
  });
});
