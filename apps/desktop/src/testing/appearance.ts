// The system's appearance and the native window, as UI tests drive and read
// them, and the theme's ambient state, which the setup resets after each test.
//
// happy-dom answers `(prefers-color-scheme: dark)` from its device settings,
// but re-checks a media list only on a window `resize`: changing the setting
// alone fires no `change`. Flipping the OS is therefore both, here, in one
// place, instead of a polyfill of the media list.

import { THEME_STORAGE_KEY } from "../theme/resolve.ts";
import { ipcInvocations, scriptIpc } from "./ipcDoor.ts";

/** The window commands the theme sends, answered for every UI test by renderApp(). */
const WINDOW_COMMANDS = ["plugin:window|set_background_color", "plugin:window|set_theme"] as const;

/** happy-dom's default, which every test starts from. */
const DEFAULT_SYSTEM_APPEARANCE = "light";

interface DeviceSettings {
  prefersColorScheme: string;
}

/**
 * happy-dom's device settings, through its window API. The DOM types do not
 * describe `window.happyDOM`, hence the one cast, at that boundary; if an
 * upgrade moves the API this fails loudly instead of flipping nothing.
 */
function deviceSettings(): DeviceSettings {
  const device = (window as unknown as { happyDOM?: { settings?: { device?: Partial<DeviceSettings> } } }).happyDOM?.settings?.device;
  if (typeof device?.prefersColorScheme !== "string") {
    throw new Error("The harness cannot reach happy-dom's window.happyDOM.settings.device.prefersColorScheme; check the happy-dom version.");
  }
  return device as DeviceSettings;
}

/** Switch the OS to `appearance`, as System Settings would: the page's media list changes and says so. */
export function setSystemAppearance(appearance: "dark" | "light"): void {
  deviceSettings().prefersColorScheme = appearance;
  window.dispatchEvent(new Event("resize"));
}

/** Answer the theme's window commands. Called by renderApp(), as serveFakeHost answers `host_endpoint`. */
export function scriptWindow(): void {
  for (const command of WINDOW_COMMANDS) scriptIpc(command, () => null);
}

/** What the window was told, in order, as `set_background_color #1e1e2e` or `set_theme null`. */
export function windowCalls(): string[] {
  return ipcInvocations()
    .filter(({ command }) => command.startsWith("plugin:window|"))
    .map(({ command, args }) => `${command.slice("plugin:window|".length)} ${String((args as { value?: unknown }).value)}`);
}

/** The theme classes on <html>: exactly one, when the theme is applied. */
export function themeClasses(): string[] {
  return [...document.documentElement.classList].filter((name) => name === "dark" || name === "light");
}

/** The preference kept for the next launch, or null. */
export const storedPreference = (): string | null => window.localStorage.getItem(THEME_STORAGE_KEY);

/**
 * Put the theme's ambient state back as a fresh launch finds it: nothing
 * stored, no theme class, a light system. The setup calls this right after
 * unmounting, when nothing listens any more; a test calls it to prove one
 * test's choice does not reach the next.
 */
export function resetAppearance(): void {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark", "light");
  deviceSettings().prefersColorScheme = DEFAULT_SYSTEM_APPEARANCE;
}
