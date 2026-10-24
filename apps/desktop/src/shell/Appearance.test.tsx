import { act, cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "../theme/resolve.ts";
import { resetAppearance, setSystemAppearance, storedPreference, themeClasses, windowCalls } from "../testing/appearance.ts";
import { serveFakeHost } from "../testing/fakeHost.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { garden, model } from "../testing/worlds.ts";

const control = (name: string) => screen.findByRole("button", { name });
const serve = () => serveFakeHost({ models: [model], journeys: [garden], turns: [] });

describe("the app's appearance", () => {
  it("launches on a light system as light, following the system, before the first render", async () => {
    serve();
    renderApp();
    // Synchronously after renderApp(): boot ran before React rendered anything.
    expect(themeClasses()).toEqual(["light"]);
    expect(windowCalls()).toEqual(["set_background_color #efeeee", "set_theme null"]);
    expect(await control("Appearance: system")).toBeTruthy();
  });

  it("cycles system, dark, light, system, each applied at once and kept", async () => {
    serve();
    const user = userEvent.setup();
    renderApp();

    await user.click(await control("Appearance: system"));
    expect(screen.getByRole("button", { name: "Appearance: dark" })).toBeTruthy();
    expect(themeClasses()).toEqual(["dark"]);
    expect(storedPreference()).toBe("dark");
    expect(windowCalls().slice(-2)).toEqual(["set_background_color #1e1e2e", "set_theme dark"]);

    await user.click(screen.getByRole("button", { name: "Appearance: dark" }));
    expect(screen.getByRole("button", { name: "Appearance: light" })).toBeTruthy();
    expect(themeClasses()).toEqual(["light"]);
    expect(storedPreference()).toBe("light");
    expect(windowCalls().slice(-2)).toEqual(["set_background_color #efeeee", "set_theme light"]);

    await user.click(screen.getByRole("button", { name: "Appearance: light" }));
    expect(screen.getByRole("button", { name: "Appearance: system" })).toBeTruthy();
    expect(themeClasses()).toEqual(["light"]);
    expect(storedPreference()).toBe("system");
    // Back to system, the window is let go to follow the system itself.
    expect(windowCalls().slice(-2)).toEqual(["set_background_color #efeeee", "set_theme null"]);
  });

  it("opens dark after a relaunch on a light system, and says so", async () => {
    serve();
    const user = userEvent.setup();
    renderApp();
    await user.click(await control("Appearance: system"));
    expect(storedPreference()).toBe("dark");

    // Quit and launch again, on the same machine: the store starts over, storage remains.
    cleanup();
    renderApp();
    expect(themeClasses()).toEqual(["dark"]);
    expect(windowCalls().slice(-2)).toEqual(["set_background_color #1e1e2e", "set_theme dark"]);
    expect(await control("Appearance: dark")).toBeTruthy();
  });

  it("follows the OS under system, and tells the window again", async () => {
    serve();
    renderApp();
    await control("Appearance: system");
    const before = windowCalls().length;

    act(() => setSystemAppearance("dark"));
    expect(themeClasses()).toEqual(["dark"]);
    expect(windowCalls().slice(before)).toEqual(["set_background_color #1e1e2e", "set_theme null"]);

    act(() => setSystemAppearance("light"));
    expect(themeClasses()).toEqual(["light"]);
    expect(windowCalls().slice(-2)).toEqual(["set_background_color #efeeee", "set_theme null"]);
    // Following the system is not a choice: nothing was kept.
    expect(storedPreference()).toBeNull();
  });

  it("holds an explicit choice when the OS changes, and follows the OS again under system", async () => {
    serve();
    const user = userEvent.setup();
    renderApp();
    await user.click(await control("Appearance: system")); // dark

    act(() => setSystemAppearance("dark"));
    act(() => setSystemAppearance("light"));
    expect(themeClasses()).toEqual(["dark"]);

    await user.click(screen.getByRole("button", { name: "Appearance: dark" })); // light
    act(() => setSystemAppearance("dark"));
    expect(themeClasses()).toEqual(["light"]);

    await user.click(screen.getByRole("button", { name: "Appearance: light" })); // system, and the OS is dark now
    expect(themeClasses()).toEqual(["dark"]);
  });

  it("launches on system when the stored value is not one the app writes", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    serve();
    renderApp();
    expect(themeClasses()).toEqual(["light"]);
    expect(await control("Appearance: system")).toBeTruthy();
  });

  it("lets no test's choice reach the next", async () => {
    serve();
    const user = userEvent.setup();
    renderApp();
    await user.click(await control("Appearance: system"));
    act(() => setSystemAppearance("dark"));
    expect(themeClasses()).toEqual(["dark"]);

    // What the setup does between two tests: unmount, then this.
    cleanup();
    resetAppearance();
    expect(themeClasses()).toEqual([]);
    expect(storedPreference()).toBeNull();
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);

    renderApp();
    expect(themeClasses()).toEqual(["light"]);
    expect(await control("Appearance: system")).toBeTruthy();
  });
});
