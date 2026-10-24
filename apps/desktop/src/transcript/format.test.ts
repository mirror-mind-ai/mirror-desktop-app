import { describe, expect, it } from "vitest";

import { resultPreview, toolArguments, toolDuration, toolPreview } from "./format.ts";

describe("a tool call's folded arguments, as Pi folds them", () => {
  it("are key=value pairs, each value as JSON, joined by spaces", () => {
    expect(toolPreview({ command: "ls -la", timeout: 5 })).toBe('command="ls -la" timeout=5');
  });

  it("name arguments that are not an object `args`, and say nothing for none", () => {
    expect(toolPreview(["a", "b"])).toBe('args=["a","b"]');
    expect(toolPreview("plain")).toBe('args="plain"');
    expect(toolPreview({})).toBe("");
    expect(toolPreview(null)).toBe("");
    expect(toolPreview(undefined)).toBe("");
  });

  it("are cut at 100 characters, the last three an ellipsis", () => {
    const exactly100 = { k: "x".repeat(96) }; // k="" is four characters, so 96 make 100
    expect(toolPreview(exactly100)).toHaveLength(100);
    expect(toolPreview(exactly100).endsWith('x"')).toBe(true);

    const longer = toolPreview({ k: "x".repeat(200) });
    expect(longer).toHaveLength(100);
    expect(longer.endsWith("...")).toBe(true);
  });
});

describe("a tool call's arguments in full, as Pi expands them", () => {
  it("are each argument with its value: a string as it is, the rest as indented JSON", () => {
    expect(toolArguments({ command: "ls\r\n-la", options: { all: true } })).toEqual([
      { key: "command", value: "ls\n-la" },
      { key: "options", value: '{\n  "all": true\n}' },
    ]);
    expect(toolArguments("plain")).toEqual([{ key: "args", value: "plain" }]);
    expect(toolArguments(null)).toEqual([]);
  });
});

describe("a tool call's duration, as Pi formats it", () => {
  it("is tenths of a second under a minute, then minutes and seconds, then hours", () => {
    expect(toolDuration(0)).toBe("0.0s");
    expect(toolDuration(4200)).toBe("4.2s");
    expect(toolDuration(90_000)).toBe("1m 30s");
    expect(toolDuration(7_384_000)).toBe("2h 3m 4s");
  });
});

describe("a tool call's result, folded", () => {
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");

  it("shows the first ten lines and counts the rest", () => {
    expect(resultPreview(lines(12))).toEqual({ shown: lines(10), more: 2 });
    expect(resultPreview(lines(10))).toEqual({ shown: lines(10), more: 0 });
  });

  it("does not count the newline that ends the last line as a line of its own", () => {
    expect(resultPreview(`${lines(11)}\n`)).toEqual({ shown: lines(10), more: 1 });
    expect(resultPreview("")).toEqual({ shown: "", more: 0 });
  });
});
