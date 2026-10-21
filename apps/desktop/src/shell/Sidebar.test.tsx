import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { journeysNav, messageBox, sidebarOutline } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { attic, beds, briefAnswer, garden, loft, model, orchard, pears } from "../testing/worlds.ts";

describe("the Journeys sidebar", () => {
  it("lists the active Journeys as Mirror nests them", async () => {
    serveFakeHost({ models: [model], journeys: [attic, beds, garden, loft], turns: [] });
    renderApp();

    await screen.findByRole("button", { name: "Garden" });
    expect(sidebarOutline()).toEqual(["Garden", "  Beds", "Loft"]);
    expect(screen.queryByRole("button", { name: "Attic" })).toBeNull();
  });

  it("shows a picked Journey and opens nothing, however often it is picked, until the first send", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden, beds],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.click(screen.getByRole("button", { name: "Beds" }));
    await user.dblClick(screen.getByRole("button", { name: "Garden" }));

    expect(screen.getByRole("heading", { name: "Garden" })).toBeTruthy();
    expect(screen.getByText("~/garden")).toBeTruthy();
    expect(messageBox()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Garden", current: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Beds", current: false })).toBeTruthy();

    // The first send opens one session: so the picks before it opened none.
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText("Good morning.");
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
    await screen.findByRole("button", { name: "Garden", busy: false });
  });

  it("says how to give a Journey a project path, and opens nothing for it", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [orchard, pears],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Ripe.") }],
    });
    const user = userEvent.setup();
    renderApp();

    const item = await screen.findByRole("button", { name: "Orchard", description: /No project path yet/ });
    expect(sidebarOutline()).toEqual(["Orchard", "  Pears"]);
    await user.click(item);

    expect(screen.getByText("Orchard has no project path yet, so there is nowhere for a session to run.")).toBeTruthy();
    expect(screen.getByText("mirror journey set-path orchard /path/to/project")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(host.requestsOf("journeys.list")).toHaveLength(2));
    await screen.findByRole("button", { name: "Orchard" });

    // Its child has a project path: it opens, and is the only one that did.
    await user.click(screen.getByRole("button", { name: "Pears" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText("Ripe.");
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "pears" }]);
    await screen.findByRole("button", { name: "Pears", busy: false });
  });

  it("says when Mirror has no active Journeys, how many it is not showing, and looks again on Refresh", async () => {
    const host = serveFakeHost({ models: [model], journeys: [attic], turns: [] });
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("No active Journeys");
    expect(screen.getByText("1 inactive Journey is not shown.")).toBeTruthy();
    expect(screen.queryByText("Pick a Journey")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(host.requestsOf("journeys.list")).toHaveLength(2));
    await screen.findByText("No active Journeys");
  });

  it("says Mirror isn't set up, in its own words and the host's, and lists the Journeys once it is", async () => {
    const notConfigured = { code: "mirror_not_configured", message: "No Mirror home is configured on this machine yet." } as const;
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [],
      failures: [{ request: "journeys.list", error: notConfigured }],
    });
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: "Mirror isn't set up on this Mac yet" });
    // Once: a standing state is said in place, never also as a toast.
    expect(screen.getAllByText(notConfigured.message)).toHaveLength(1);
    expect(screen.getByText("mirror init")).toBeTruthy();
    expect(screen.queryByText("Pick a Journey")).toBeNull();

    host.stopFailing("journeys.list");
    await user.click(within(journeysNav()).getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Garden" });
    expect(host.requestsOf("journeys.list")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Mirror isn't set up on this Mac yet" })).toBeNull();
    expect(screen.getByText("Pick a Journey")).toBeTruthy();
  });
});
