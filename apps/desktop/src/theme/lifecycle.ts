// The theme's two moments: before the first render, and while the app runs.
//
// bootTheme runs once, synchronously, right before rendering, in main.tsx and
// in the tests' renderApp() alike, so the first frame React paints is already
// in the right theme. syncTheme runs for as long as the app is mounted, from an
// effect in App, and is the one writer of the theme's effects after boot.

import { applyTheme } from "./apply.ts";
import type { ThemeEnvironment } from "./environment.ts";
import { parsePreference, THEME_STORAGE_KEY, type ThemePreference } from "./resolve.ts";
import { hydrateTheme, resolvedTheme, systemAppearanceChanged, useTheme } from "./store.ts";

/** The stored preference and the system's appearance into the store, and the theme applied. */
export function bootTheme(env: ThemeEnvironment): void {
  hydrateTheme(readPreference(env.storage), env.systemDark.matches);
  const state = useTheme.getState();
  applyTheme(env, state.preference, resolvedTheme(state));
}

/**
 * Apply each change of the preference or of the theme it resolves to, keep a
 * new preference for the next launch, and follow the system's appearance.
 * Returns the cleanup, which stops all three.
 */
export function syncTheme(env: ThemeEnvironment): () => void {
  const unsubscribe = useTheme.subscribe((state, previous) => {
    const choiceChanged = state.preference !== previous.preference;
    if (choiceChanged) writePreference(env.storage, state.preference);
    const theme = resolvedTheme(state);
    if (choiceChanged || theme !== resolvedTheme(previous)) applyTheme(env, state.preference, theme);
  });
  const followSystem = (event: { readonly matches: boolean }) => systemAppearanceChanged(event.matches);
  env.systemDark.addEventListener("change", followSystem);
  // The system may have changed between boot and now, while nothing listened.
  systemAppearanceChanged(env.systemDark.matches);
  return () => {
    env.systemDark.removeEventListener("change", followSystem);
    unsubscribe();
  };
}

function readPreference(storage: ThemeEnvironment["storage"]): ThemePreference {
  try {
    return parsePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be unavailable; the app still opens, following the system.
    return "system";
  }
}

function writePreference(storage: ThemeEnvironment["storage"], preference: ThemePreference): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    console.warn("The appearance could not be kept for the next launch:", error);
  }
}
