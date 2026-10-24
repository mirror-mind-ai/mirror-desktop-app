// The appearance the person chose, and the system's, as the shell reads them.
//
// The theme the app shows is derived from the two, never stored beside them,
// so it cannot disagree with them. The actions only change state: applying a
// theme to the page and the window, and keeping the choice for the next
// launch, is lifecycle.ts's, the one writer of those effects.

import { create } from "zustand";

import { registerStore } from "../stores/registry.ts";
import { nextPreference, resolveTheme, type Theme, type ThemePreference } from "./resolve.ts";

export interface ThemeState {
  /** What the person chose. */
  readonly preference: ThemePreference;
  /** Whether the system's appearance is dark, as the page sees it. Kept while a choice holds, so system follows it again at once. */
  readonly systemPrefersDark: boolean;
}

const initialState: ThemeState = { preference: "system", systemPrefersDark: false };

export const useTheme = create<ThemeState>()(() => initialState);
registerStore("theme", useTheme, initialState);

/** The theme the app shows. A selector: `useTheme(resolvedTheme)`. */
export const resolvedTheme = (state: ThemeState): Theme => resolveTheme(state.preference, state.systemPrefersDark);

/** Before the first render: the stored preference and the system's appearance. */
export function hydrateTheme(preference: ThemePreference, systemPrefersDark: boolean): void {
  useTheme.setState({ preference, systemPrefersDark });
}

/** The appearance control was activated: the next preference in its cycle. */
export function cycleAppearance(): void {
  useTheme.setState((state) => ({ preference: nextPreference(state.preference) }));
}

/** The system's appearance changed. */
export function systemAppearanceChanged(systemPrefersDark: boolean): void {
  useTheme.setState({ systemPrefersDark });
}
