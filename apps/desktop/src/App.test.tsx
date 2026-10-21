import type { AvailableModel, Journey, SessionEvent } from "@mirror-desktop/protocol";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "./testing/fakeHost.ts";
import { renderApp } from "./testing/renderApp.tsx";
import { loadTurn } from "./testing/turns.ts";

const garden: Journey = {
  id: "garden",
  name: "Garden",
  status: "active",
  description: "Tending things",
  projectPath: "/Users/test/garden",
};
const model: AvailableModel = { provider: "anthropic", id: "claude-test", name: "Claude Test", reasoning: true };

const streamedAnswer = loadTurn("streamed-answer");
/** What the assistant says in the fixture: the oracle comes from the fixture, never typed twice. */
const answer = streamedAnswer.flatMap((event) =>
  event.type === "message_end" && event.role === "assistant" ? [event.text] : [],
)[0];

const isTextDelta = (event: SessionEvent) => event.type === "text_delta";
const isAssistantEnd = (event: SessionEvent) => event.type === "message_end" && event.role === "assistant";

/** The element whose whole text is exactly `text`, line breaks included; named in a failure by that text. */
const exactly = (text: string) =>
  Object.assign((_: string, element: Element | null) => element?.textContent === text, {
    toString: () => `exactly ${JSON.stringify(text)}`,
  });

describe("the console against the fake host", () => {
  it("opens a Journey, sends a prompt, and watches the answer stream in until the turn settles", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: streamedAnswer, held: true }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /Garden/ }));
    const composer = await screen.findByRole("textbox");
    await user.type(composer, "Hello{Enter}");

    const prompt = await screen.findByText("Hello");
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    const turn = host.heldTurn();
    turn.releaseThrough(isTextDelta);
    turn.releaseThrough(isTextDelta);
    await screen.findByText(exactly("Tides turn slowly\n"));

    turn.releaseThrough(isAssistantEnd);
    const whole = await screen.findByText(exactly(answer ?? "the fixture has no assistant answer"));
    expect(prompt.compareDocumentPosition(whole) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    turn.release();
    const send = await screen.findByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.type(composer, "Again");
    expect((send as HTMLButtonElement).disabled).toBe(false);

    expect(host.requestsOf("hello").length).toBeGreaterThan(0);
    expect(host.requestsOf("hello").every((hello) => hello.token === host.endpoint.token)).toBe(true);
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
    expect(host.requestsOf("session.prompt")).toEqual([{ type: "session.prompt", sessionId: "session-1", text: "Hello" }]);
  });

  it("can end in the middle of a turn without the rest of it reaching the next test", async () => {
    serveFakeHost({ models: [model], journeys: [garden], turns: [{ prompt: "Hello", events: streamedAnswer }] });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /Garden/ }));
    await user.type(await screen.findByRole("textbox"), "Hello{Enter}");
    await screen.findByText("Hello");
  });

  // Characterization, before the shell replaces the console (CV1.DS1.US1):
  // with no model it can use, the console puts the sign-in panel in place of
  // everything, so no Journey can be picked. The shell keeps the Journeys in
  // sight and moves sign-in into the conversation area.
  it("with no model it can use, offers sign-in in place of the Journeys", async () => {
    serveFakeHost({ models: [], journeys: [garden], turns: [] });
    renderApp();

    await screen.findByRole("heading", { name: "Sign in to a model provider" });
    await waitFor(() => expect(screen.queryByText("Loading providers…")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Open a Journey" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Garden/ })).toBeNull();
  });
});
