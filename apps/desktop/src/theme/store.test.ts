import { beforeEach, describe, expect, it } from "vitest";

import { resetAllStores } from "../stores/registry.ts";
import { cycleAppearance, hydrateTheme, resolvedTheme, systemAppearanceChanged, useTheme } from "./store.ts";

const theme = () => resolvedTheme(useTheme.getState());

describe("the theme store", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("starts on system, on a light system, until boot says otherwise", () => {
    expect(useTheme.getState()).toEqual({ preference: "system", systemPrefersDark: false });
    expect(theme()).toBe("light");
  });

  it("takes the stored preference and the system's appearance at boot", () => {
    hydrateTheme("dark", false);
    expect(useTheme.getState()).toEqual({ preference: "dark", systemPrefersDark: false });
    expect(theme()).toBe("dark");
  });

  it("cycles the preference: system, dark, light, system", () => {
    const seen: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      cycleAppearance();
      seen.push(useTheme.getState().preference);
    }
    expect(seen).toEqual(["dark", "light", "system"]);
  });

  it("derives the theme from the pair, so the two can never disagree", () => {
    systemAppearanceChanged(true);
    expect(theme()).toBe("dark");
    cycleAppearance(); // dark
    cycleAppearance(); // light
    expect(theme()).toBe("light");
    systemAppearanceChanged(false);
    cycleAppearance(); // system
    expect(theme()).toBe("light");
    systemAppearanceChanged(true);
    expect(theme()).toBe("dark");
  });

  it("keeps the system's appearance while a choice holds, so system follows it again at once", () => {
    cycleAppearance(); // dark
    systemAppearanceChanged(true);
    systemAppearanceChanged(false);
    expect(theme()).toBe("dark");
    cycleAppearance(); // light
    cycleAppearance(); // system
    expect(useTheme.getState().systemPrefersDark).toBe(false);
    expect(theme()).toBe("light");
  });
});
