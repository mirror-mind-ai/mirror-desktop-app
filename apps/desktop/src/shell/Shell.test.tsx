import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { journeysNav } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { garden, model } from "../testing/worlds.ts";

describe("the shell", () => {
  it("says the host could not be reached, offers nothing to pick, and connects on Try again", async () => {
    const unauthorized = { code: "unauthorized", message: "The host did not recognize this token." } as const;
    const host = serveFakeHost({ models: [model], journeys: [garden], turns: [], failures: [{ request: "hello", error: unauthorized }] });
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: "The host could not be reached" });
    expect(screen.getAllByText(unauthorized.message)).toHaveLength(1);
    expect(within(journeysNav()).queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText("Loading Journeys…")).toBeNull();
    expect(screen.queryByText("Pick a Journey")).toBeNull();

    const hellos = host.requestsOf("hello").length;
    host.stopFailing("hello");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Garden" });
    expect(host.requestsOf("hello").length).toBeGreaterThan(hellos);
    expect(screen.queryByRole("heading", { name: "The host could not be reached" })).toBeNull();
  });

  it("keeps the host's versions behind About, and sign-in behind Sign in", async () => {
    serveFakeHost({ models: [model], journeys: [garden], turns: [] });
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("button", { name: "Garden" });
    expect(screen.queryByText(/Node v24/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByText("Node v24.0.0 · Pi 0.0.0-fake · Mirror 0.0.0-fake")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in to a model provider" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loading providers…")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Pick a Journey")).toBeTruthy();
  });
});
