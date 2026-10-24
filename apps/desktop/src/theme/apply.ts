import type { ThemeEnvironment } from "./environment.ts";
import { CANVAS, type Theme, type ThemePreference } from "./resolve.ts";

/**
 * Show `theme`: exactly one of `dark` and `light` on the root, at once, so a
 * render right after paints in it (`color-scheme` follows the class in the
 * stylesheet); then the window told its ground and its appearance.
 *
 * Under `system` the window is told `null`, to follow the system itself. A
 * window forced dark reports dark to the page's own prefers-color-scheme, so
 * forcing it under `system` would leave the app following its own last choice
 * instead of the system.
 */
export function applyTheme(env: ThemeEnvironment, preference: ThemePreference, theme: Theme): void {
  env.root.classList.remove(theme === "dark" ? "light" : "dark");
  env.root.classList.add(theme);
  tellWindow("its background", () => env.window.setBackgroundColor(CANVAS[theme]));
  tellWindow("its appearance", () => env.window.setTheme(preference === "system" ? null : theme));
}

/**
 * The window's answer is not waited for: the page already shows the theme. A
 * refusal (a missing permission, no Tauri at all) is worth a warning, and must
 * never become an unhandled rejection or an exception before the first render.
 */
function tellWindow(what: string, call: () => Promise<void>): void {
  void (async () => {
    try {
      await call();
    } catch (error) {
      console.warn(`The window could not change ${what}:`, error);
    }
  })();
}
