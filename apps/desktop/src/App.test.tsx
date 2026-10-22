import type { SessionEvent } from "@mirror-desktop/protocol";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "./testing/fakeHost.ts";
import { exactly, messageBox, transcript } from "./testing/queries.ts";
import { renderApp } from "./testing/renderApp.tsx";
import { assistantTextOf, loadTurn } from "./testing/turns.ts";
import { garden, model } from "./testing/worlds.ts";

const streamedAnswer = loadTurn("streamed-answer");
const answer = assistantTextOf(streamedAnswer);

const isTextDelta = (event: SessionEvent) => event.type === "text_delta";
const isAssistantEnd = (event: SessionEvent) => event.type === "message_end" && event.role === "assistant";

describe("the shell against the fake host", () => {
  it("picks a Journey, sends a prompt, and watches the answer stream in until the turn settles", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: streamedAnswer, held: true }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    const composer = messageBox();
    await user.type(composer, "Hello{Enter}");

    const prompt = await within(transcript()).findByText("Hello");
    await screen.findByRole("button", { name: "Stop" });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    await waitFor(() => expect(host.requestsOf("session.prompt")).toHaveLength(1));
    const turn = host.heldTurn();
    turn.releaseThrough(isTextDelta);
    turn.releaseThrough(isTextDelta);
    await screen.findByText(exactly("Tides turn slowly\n"));

    turn.releaseThrough(isAssistantEnd);
    const whole = await screen.findByText(exactly(answer));
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

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText("Tides", { exact: false });
  });

  it("starts every render clean: no Journey picked, no conversation, no draft from before", async () => {
    serveFakeHost({ models: [model], journeys: [garden], turns: [] });
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Unsent");
    first.unmount();

    renderApp();
    await screen.findByRole("button", { name: "Garden" });
    expect(screen.getByRole("button", { name: "Garden", current: false })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.getByText("Pick a Journey")).toBeTruthy();
  });

  // The console put the sign-in panel in place of everything when no model
  // could be used, so no Journey could be picked. The shell keeps the Journeys
  // in sight and offers sign-in in the conversation's place.
  it("with no model to use, keeps the Journeys in sight and offers sign-in in the conversation's place", async () => {
    const host = serveFakeHost({ models: [], journeys: [garden], turns: [] });
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole("heading", { name: "Sign in to a model provider" });
    await user.click(await screen.findByRole("button", { name: "Garden" }));
    expect(screen.getByRole("heading", { name: "Garden" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in to a model provider" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Loading providers…")).toBeNull());

    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    expect(screen.queryByText(/model\?/)).toBeNull();
    expect(host.requestsOf("session.open")).toEqual([]);
  });
});
