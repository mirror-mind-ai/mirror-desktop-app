import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAllStores } from "../stores/registry.ts";
import type { SystemAppearance, ThemeEnvironment } from "./environment.ts";
import { bootTheme, syncTheme } from "./lifecycle.ts";
import { THEME_STORAGE_KEY } from "./resolve.ts";
import { cycleAppearance, useTheme } from "./store.ts";

/**
 * A theme environment the test holds in its hand: storage as a map, a detached
 * root, a system appearance it can flip, and a window that writes down what it
 * was told. No Tauri, no harness door.
 */
function world(options: { stored?: string; systemDark?: boolean; storage?: ThemeEnvironment["storage"] } = {}) {
  const stored = new Map<string, string>(options.stored === undefined ? [] : [[THEME_STORAGE_KEY, options.stored]]);
  const listeners = new Set<(event: { readonly matches: boolean }) => void>();
  const system: SystemAppearance = {
    matches: options.systemDark ?? false,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const told: string[] = [];
  const env: ThemeEnvironment = {
    storage: options.storage ?? {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
    root: document.createElement("div"),
    systemDark: system,
    window: {
      setBackgroundColor: async (color) => {
        told.push(`background ${color}`);
      },
      setTheme: async (theme) => {
        told.push(`theme ${String(theme)}`);
      },
    },
  };
  return {
    env,
    stored,
    told,
    listeners,
    classes: () => [...env.root.classList],
    flipSystem(dark: boolean) {
      (system as { matches: boolean }).matches = dark;
      for (const listener of listeners) listener({ matches: dark });
    },
  };
}

describe("booting the theme", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("applies the stored choice before returning, so the first render is already in it", () => {
    const w = world({ stored: "dark", systemDark: false });
    bootTheme(w.env);
    // Nothing awaited: the class is there the moment boot returns.
    expect(w.classes()).toEqual(["dark"]);
    expect(useTheme.getState()).toEqual({ preference: "dark", systemPrefersDark: false });
    expect(w.told).toEqual(["background #1e1e2e", "theme dark"]);
  });

  it("follows the system when nothing is stored, and lets the window follow it too", () => {
    const w = world({ systemDark: true });
    bootTheme(w.env);
    expect(w.classes()).toEqual(["dark"]);
    expect(w.told).toEqual(["background #1e1e2e", "theme null"]);
  });

  it("boots on system when the stored value is not one the app writes", () => {
    const w = world({ stored: "sepia", systemDark: false });
    bootTheme(w.env);
    expect(useTheme.getState().preference).toBe("system");
    expect(w.classes()).toEqual(["light"]);
  });

  it("boots on system when storage cannot be read at all", () => {
    const w = world({
      storage: {
        getItem: () => {
          throw new Error("storage is disabled");
        },
        setItem: () => undefined,
      },
    });
    bootTheme(w.env);
    expect(useTheme.getState().preference).toBe("system");
    expect(w.classes()).toEqual(["light"]);
  });

  it("leaves exactly one of dark and light on the root, whatever was there", () => {
    const w = world({ stored: "light" });
    w.env.root.classList.add("dark", "keep-me");
    bootTheme(w.env);
    expect(w.classes().sort()).toEqual(["keep-me", "light"]);
  });
});

describe("keeping the theme in sync while the app runs", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });

  it("applies and keeps each choice the person makes", () => {
    const w = world({ systemDark: false });
    bootTheme(w.env);
    stop = syncTheme(w.env);
    w.told.length = 0;

    cycleAppearance(); // dark
    expect(w.classes()).toEqual(["dark"]);
    expect(w.stored.get(THEME_STORAGE_KEY)).toBe("dark");
    cycleAppearance(); // light
    expect(w.classes()).toEqual(["light"]);
    expect(w.stored.get(THEME_STORAGE_KEY)).toBe("light");
    cycleAppearance(); // system, on a light system: the theme stays light, the window is let go
    expect(w.classes()).toEqual(["light"]);
    expect(w.stored.get(THEME_STORAGE_KEY)).toBe("system");
    expect(w.told).toEqual([
      "background #1e1e2e",
      "theme dark",
      "background #efeeee",
      "theme light",
      "background #efeeee",
      "theme null",
    ]);
  });

  it("follows the system's appearance under system, and tells the window again", () => {
    const w = world({ systemDark: false });
    bootTheme(w.env);
    stop = syncTheme(w.env);
    w.told.length = 0;

    w.flipSystem(true);
    expect(w.classes()).toEqual(["dark"]);
    expect(w.told).toEqual(["background #1e1e2e", "theme null"]);
    // Following the system is not a choice: nothing is stored.
    expect(w.stored.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it("holds an explicit choice when the system changes", () => {
    const w = world({ stored: "light", systemDark: false });
    bootTheme(w.env);
    stop = syncTheme(w.env);
    w.told.length = 0;

    w.flipSystem(true);
    expect(w.classes()).toEqual(["light"]);
    expect(w.told).toEqual([]);
  });

  it("catches up with a system change it missed between boot and sync", () => {
    const w = world({ systemDark: false });
    bootTheme(w.env);
    (w.env.systemDark as { matches: boolean }).matches = true;
    stop = syncTheme(w.env);
    expect(w.classes()).toEqual(["dark"]);
  });

  it("stops listening and stops applying once cleaned up", () => {
    const w = world({ systemDark: false });
    bootTheme(w.env);
    const cleanup = syncTheme(w.env);
    expect(w.listeners.size).toBe(1);
    cleanup();
    expect(w.listeners.size).toBe(0);

    w.told.length = 0;
    cycleAppearance();
    expect(w.classes()).toEqual(["light"]);
    expect(w.told).toEqual([]);
  });

  it("survives a sync started twice and stopped once, as StrictMode does", () => {
    const w = world({ systemDark: false });
    bootTheme(w.env);
    syncTheme(w.env)();
    stop = syncTheme(w.env);
    w.told.length = 0;

    cycleAppearance();
    // Applied once, not twice: the first sync left nothing behind.
    expect(w.told).toEqual(["background #1e1e2e", "theme dark"]);
  });

  it("warns when the window refuses, and never leaves the refusal unhandled", async () => {
    const w = world();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    w.env = {
      ...w.env,
      window: {
        setBackgroundColor: async () => {
          throw new Error("not allowed: set_background_color");
        },
        setTheme: () => {
          // A window that throws before it even returns a promise.
          throw new Error("not allowed: set_theme");
        },
      },
    };
    bootTheme(w.env);
    expect(w.classes()).toEqual(["light"]);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    // In whichever order the two refusals arrive: one call threw, the other rejected.
    expect(warn.mock.calls.map((call) => String(call[0])).sort()).toEqual([
      "The window could not change its appearance:",
      "The window could not change its background:",
    ]);
  });
});
