import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

describe("Escape stops the turn", () => {
  function running() {
    return serveFakeHost({
      models: [model],
      journeys: [garden, beds],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning."), held: true }],
    });
  }

  it("sends Stop once from the text box, held down or not", async () => {
    const host = running();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(stop.getAttribute("aria-keyshortcuts")).toBe("Escape");

    fireEvent.keyDown(messageBox(), { key: "Escape", repeat: true });
    expect(host.requestsOf("session.abort")).toHaveLength(0);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(host.requestsOf("session.abort")).toEqual([{ type: "session.abort", sessionId: "session-1" }]));

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
  });

  it("sends Stop with focus elsewhere in the window, but not to a closable that took Escape first", async () => {
    const host = running();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });

    const picked = screen.getByRole("button", { name: "Garden" });
    picked.focus();
    fireEvent.keyDown(picked, { key: "Escape" });
    await waitFor(() => expect(host.requestsOf("session.abort")).toHaveLength(1));

    // An overlay that handles Escape prevents the default; the turn is left alone.
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    picked.dispatchEvent(event);
    fireEvent.keyDown(picked, { key: "Escape", isComposing: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.requestsOf("session.abort")).toHaveLength(1);

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
  });

  it("sends nothing while nothing runs on screen, even if another Journey runs, and keeps the draft", async () => {
    const host = running();
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Draft");
    await user.keyboard("{Escape}");
    expect(messageBox().value).toBe("Draft");

    await user.clear(messageBox());
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Beds" }));
    await user.keyboard("{Escape}");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.requestsOf("session.abort")).toHaveLength(0);

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Garden", busy: false });
  });
});
