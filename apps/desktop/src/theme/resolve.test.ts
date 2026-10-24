import { describe, expect, it } from "vitest";

import { nextPreference, parsePreference, resolveTheme } from "./resolve.ts";

describe("the stored preference", () => {
  it("reads back each preference the app writes", () => {
    expect(parsePreference("system")).toBe("system");
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("light")).toBe("light");
  });

  it("reads anything else as system: nothing stored, an old value, a hand edit", () => {
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("")).toBe("system");
    expect(parsePreference("sepia")).toBe("system");
    expect(parsePreference("Dark")).toBe("system");
  });
});

describe("the theme a preference resolves to", () => {
  it("follows the system under system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("holds an explicit choice whatever the system prefers", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });
});

describe("the appearance control's cycle", () => {
  it("goes system, dark, light, and back to system", () => {
    expect(nextPreference("system")).toBe("dark");
    expect(nextPreference("dark")).toBe("light");
    expect(nextPreference("light")).toBe("system");
  });
});
