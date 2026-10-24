import { fireEvent, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { beds, briefAnswer, garden, model } from "../testing/worlds.ts";

describe("the composer's keys", () => {
  it("focuses the text box when a Journey is shown, and again after a switch", async () => {
    serveFakeHost({ models: [model], journeys: [garden, beds], turns: [] });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    expect(document.activeElement).toBe(messageBox());
    await user.keyboard("Hello");
    expect(messageBox().value).toBe("Hello");

    await user.click(screen.getByRole("button", { name: "Beds" }));
    expect(document.activeElement).toBe(messageBox());
  });

  it("breaks a line on Shift+Enter without sending", async () => {
    const host = serveFakeHost({ models: [model], journeys: [garden], turns: [] });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Shift>}{Enter}{/Shift}there");
    expect(messageBox().value).toBe("Hello\nthere");
    expect(within(transcript()).queryByText(/Hello/)).toBeNull();
    expect(host.requestsOf("session.open")).toHaveLength(0);
  });

  it("does not send on an Enter that arrives while an IME is composing", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello");
    // user-event cannot compose; the event is dispatched as a composing Enter arrives.
    fireEvent.keyDown(messageBox(), { key: "Enter", isComposing: true });
    expect(messageBox().value).toBe("Hello");
    expect(host.requestsOf("session.open")).toHaveLength(0);

    await user.keyboard("{Enter}");
    await screen.findByText("Good morning.");
    expect(messageBox().value).toBe("");
  });
});
