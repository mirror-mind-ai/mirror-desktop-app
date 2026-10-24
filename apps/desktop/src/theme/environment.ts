import { getCurrentWindow } from "@tauri-apps/api/window";

import type { Theme } from "./resolve.ts";

/**
 * What the theme touches outside the store: where the choice is kept, the
 * page's root, the system's appearance and the native window. The app passes
 * the browser's; the theme's own tests pass one they hold in their hand.
 */
export interface ThemeEnvironment {
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  /** `<html>`: its class is the theme every token follows. */
  readonly root: HTMLElement;
  /** `(prefers-color-scheme: dark)`, as the page sees it. */
  readonly systemDark: SystemAppearance;
  readonly window: ThemeWindow;
}

/** The part of a MediaQueryList the theme uses. */
export interface SystemAppearance {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { readonly matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { readonly matches: boolean }) => void): void;
}

/** The native window: its background wherever the page has not painted, and its appearance (the traffic lights, later its dialogs). */
export interface ThemeWindow {
  setBackgroundColor(color: string): Promise<void>;
  /** `null` lets the window follow the system. */
  setTheme(theme: Theme | null): Promise<void>;
}

/** The running app's environment. */
export function browserThemeEnvironment(): ThemeEnvironment {
  return {
    storage: window.localStorage,
    root: document.documentElement,
    systemDark: window.matchMedia("(prefers-color-scheme: dark)"),
    window: {
      // Async on purpose: where the window API cannot reach Tauri it throws, and
      // here that becomes a rejection apply.ts catches, never an exception that
      // stops the first render.
      setBackgroundColor: async (color) => getCurrentWindow().setBackgroundColor(color),
      setTheme: async (theme) => getCurrentWindow().setTheme(theme),
    },
  };
}
