// What the theme is, as pure values: the person's preference, the theme it
// resolves to, and the window's ground for each theme. Nothing here touches
// the page, the window or storage; that is apply.ts and lifecycle.ts.

/** How the person wants the app to look: as the system does, or always dark or light. */
export type ThemePreference = "system" | "dark" | "light";

/** What the app shows. */
export type Theme = "dark" | "light";

/** Where the preference is kept between launches, in the webview's localStorage. */
export const THEME_STORAGE_KEY = "mirror-desktop.theme";

/** In the appearance control's order: each activation moves to the next. */
const PREFERENCES: readonly ThemePreference[] = ["system", "dark", "light"];

/** The stored preference, or `system` for anything else: nothing stored, an old value, a hand edit. */
export function parsePreference(stored: string | null): ThemePreference {
  return PREFERENCES.find((preference) => preference === stored) ?? "system";
}

/** The theme shown for `preference` while the system prefers dark, or not. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** The control's cycle: system, dark, light, and back to system. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  return PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length] ?? "system";
}

/**
 * Each theme's canvas, for the native window's own background: what shows
 * wherever the page has not painted. The stylesheet defines the same values as
 * `--color-canvas`, and a test holds the two equal.
 */
export const CANVAS: Readonly<Record<Theme, string>> = { dark: "#1e1e2e", light: "#efeeee" };
