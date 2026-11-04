import type { SessionEvent } from "@mirror-desktop/protocol";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { loadTurn } from "../testing/turns.ts";
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

describe("what the composer says while a turn runs", () => {
  const line = "Pi is answering. Enter sends before its next step, Option+Enter after it finishes, Escape stops it.";

  // CV1.DS2.US2 changed what Enter does while a turn runs: it steers. The
  // draft a person types and does not send still stays.
  it("says what each key does while a turn runs, keeps a draft not sent, and goes quiet when the turn settles", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning."), held: true }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    expect(screen.getByRole("status").textContent).toBe("");
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });
    expect(screen.getByRole("status").textContent).toBe(line);
    expect(screen.getByRole("button", { name: "Steer" }).getAttribute("aria-keyshortcuts")).toBe("Enter");
    expect(screen.getByRole("button", { name: "Follow up" }).getAttribute("aria-keyshortcuts")).toBe("Alt+Enter");
    expect(screen.getByRole("button", { name: "Steer" }).hasAttribute("disabled")).toBe(true);

    await user.type(messageBox(), "Next");
    expect(screen.getByRole("button", { name: "Steer" }).hasAttribute("disabled")).toBe(false);

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(messageBox().value).toBe("Next");
    expect(host.requestsOf("session.prompt")).toHaveLength(1);
  });

  it("says once why a prompt was refused, and puts it back in the draft", async () => {
    const refused = { code: "prompt_refused", message: "No model is selected for this session." } as const;
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
      failures: [{ request: "session.prompt", journey: "garden", error: refused }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    expect(await screen.findByText(refused.message)).toBeTruthy();
    expect(messageBox().value).toBe("Hello");
    expect(within(transcript()).queryByText("Hello")).toBeNull();
    expect(document.activeElement).toBe(messageBox());

    host.stopFailing("session.prompt", "garden");
    await user.keyboard("{Enter}");
    await screen.findByText("Good morning.");
  });

  it("says once that Pi ran a message as a command, and leaves it nowhere", async () => {
    serveFakeHost({ models: [model], journeys: [garden], turns: [{ prompt: "/report", events: [], handled: true }] });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "/report{Enter}");
    expect(await screen.findByText("Pi ran that as a command; nothing was sent to the model.")).toBeTruthy();
    expect(within(transcript()).queryByText("/report")).toBeNull();
    expect(messageBox().value).toBe("");
    await screen.findByRole("button", { name: "Send" });
  });

  it("keeps the draft on an Enter while the session opens", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
      heldOpens: ["garden"],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText("Opening in ~/garden…");
    await user.type(messageBox(), "More{Enter}");
    expect(messageBox().value).toBe("More");
    expect(host.requestsOf("session.open")).toHaveLength(1);
    expect(host.requestsOf("session.prompt")).toHaveLength(0);

    host.heldOpen("garden").release();
    await screen.findByText("Good morning.");
    expect(messageBox().value).toBe("More");
  });
});

describe("a message sent into a running turn", () => {
  const queued = () => within(screen.getByRole("list", { name: "Queued messages" })).getAllByRole("listitem").map((item) => item.textContent);
  const queueList = () => screen.queryByRole("list", { name: "Queued messages" });
  const follows = (first: Element, second: Element) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  /** A turn that answers, takes `delivered` after its answer, and answers that too. */
  const followedUp = (prompt: string, delivered: string): SessionEvent[] => [
    ...briefAnswer(prompt, "Good morning.").slice(0, -2),
    { type: "message_start", role: "user" },
    { type: "message_end", role: "user", text: delivered },
    { type: "message_start", role: "assistant" },
    { type: "text_delta", delta: "Done." },
    { type: "message_end", role: "assistant", text: "Done.", stopReason: "stop" },
    { type: "agent_end" },
    { type: "agent_settled", aborted: false },
  ];

  async function answering(turn: SessionEvent[], prompt: string) {
    const host = serveFakeHost({ models: [model], journeys: [garden], turns: [{ prompt, events: turn, held: true }] });
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), `${prompt}{Enter}`);
    await screen.findByRole("button", { name: "Stop" });
    return { host, user };
  }

  it("steers with Enter: the draft empties, the queue lists it, and Pi's delivery draws it where Pi took it", async () => {
    const steered = loadTurn("steered-answer");
    const { host, user } = await answering(steered, "Walk the beds and describe each one");
    host.heldTurn().releaseThrough((event) => event.type === "tool_start");

    await user.type(messageBox(), "One line per bed{Enter}");
    expect(messageBox().value).toBe("");
    await waitFor(() => expect(queued()).toEqual(["Steering: One line per bed"]));
    expect(screen.getByText("Stop puts them back in the draft.")).toBeTruthy();
    expect(host.requestsOf("session.prompt").at(-1)).toEqual({
      type: "session.prompt",
      sessionId: "session-1",
      text: "One line per bed",
      streamingBehavior: "steer",
    });

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
    expect(queueList()).toBeNull();
    const delivered = within(transcript()).getByText("One line per bed");
    expect(follows(within(transcript()).getByText("Let me list them first."), delivered)).toBe(true);
    expect(follows(delivered, within(transcript()).getByText(/North: tomatoes/))).toBe(true);
    expect(within(transcript()).getAllByText("One line per bed")).toHaveLength(1);
  });

  it("follows up with Option+Enter, after any steer, and Pi delivers it when the answer would have ended", async () => {
    const { host, user } = await answering(followedUp("Hello", "Then say done"), "Hello");

    await user.type(messageBox(), "Then say done");
    await user.keyboard("{Alt>}{Enter}{/Alt}");
    expect(messageBox().value).toBe("");
    await waitFor(() => expect(queued()).toEqual(["Follow-up: Then say done"]));
    expect(host.requestsOf("session.prompt").at(-1)).toMatchObject({ text: "Then say done", streamingBehavior: "followUp" });

    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
    expect(follows(within(transcript()).getByText("Good morning."), within(transcript()).getByText("Then say done"))).toBe(true);
    expect(within(transcript()).getByText("Done.")).toBeTruthy();
  });

  it("stops on Stop: the answer kept and marked, what was queued back in the draft before what was typed, focus in the text box", async () => {
    const { host, user } = await answering(loadTurn("streamed-answer"), "Hello");
    host.heldTurn().releaseThrough((event) => event.type === "text_delta");
    // The answer so far: its first delta, "Tides ".
    const partial = await within(transcript()).findByText("Tides", { selector: "p" });

    await user.type(messageBox(), "**a**");
    await user.click(screen.getByRole("button", { name: "Steer" }));
    await user.type(messageBox(), "b");
    await user.click(screen.getByRole("button", { name: "Follow up" }));
    await user.type(messageBox(), "c");
    await waitFor(() => expect(queued()).toEqual(["Steering: **a**", "Follow-up: b"]));
    // The person's words, never Markdown.
    expect(screen.getByRole("list", { name: "Queued messages" }).querySelector("strong")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Stop" }));
    await screen.findByRole("button", { name: "Send" });
    await waitFor(() => expect(messageBox().value).toBe("**a**\n\nb\n\nc"));
    expect(document.activeElement).toBe(messageBox());
    expect(queueList()).toBeNull();
    const stopped = within(transcript()).getByText("Stopped");
    expect(stopped.className).toBe("text-meta text-muted");
    expect(follows(partial, stopped)).toBe(true);
    expect(host.requestsOf("session.abort")).toEqual([{ type: "session.abort", sessionId: "session-1" }]);
    expect(host.requestsOf("session.close")).toEqual([]);
  });

  it("marks an empty stopped answer when the stop came before any of it streamed", async () => {
    const { host, user } = await answering(briefAnswer("Hello", "Good morning."), "Hello");
    host.heldTurn().releaseThrough((event) => event.type === "message_end");
    await user.keyboard("{Escape}");
    await screen.findByRole("button", { name: "Send" });
    expect(within(transcript()).getAllByText("Stopped")).toHaveLength(1);
    expect(within(transcript()).getByText("Hello")).toBeTruthy();
    expect(within(transcript()).queryByText("Good morning.")).toBeNull();
  });

  it("sends nothing and stops nothing on an Enter with an empty draft", async () => {
    const { host, user } = await answering(briefAnswer("Hello", "Good morning."), "Hello");
    await user.keyboard("{Enter}");
    await user.keyboard("{Alt>}{Enter}{/Alt}");
    expect(host.requestsOf("session.prompt")).toHaveLength(1);
    expect(host.requestsOf("session.abort")).toHaveLength(0);
    expect(queueList()).toBeNull();
    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
  });
});
