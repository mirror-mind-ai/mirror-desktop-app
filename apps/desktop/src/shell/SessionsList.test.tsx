import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { type ScriptedSession, serveFakeHost, type World } from "../testing/fakeHost.ts";
import { messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { loadTurn } from "../testing/turns.ts";
import { beds, briefAnswer, garden, gardenSessions, model } from "../testing/worlds.ts";
import { sessionDate } from "./sessionDate.ts";

const [tomatoes, roses] = gardenSessions as [ScriptedSession, ScriptedSession];

/** The header's button that names the session shown and opens the list. */
const sessionsButton = () => screen.getByRole("button", { name: /^Sessions: / });
/** What the header's button says it shows. */
const named = () => sessionsButton().getAttribute("aria-label");
const listbox = () => screen.getByRole("listbox", { name: "Sessions" });
/** The list's options, each by its title, read top to bottom. */
const optionTitles = () => within(listbox()).getAllByRole("option").map((option) => option.querySelector("span")?.textContent);

async function gardenOnScreen(world: Partial<World> = {}) {
  const host = serveFakeHost({ models: [model], journeys: [garden, beds], turns: [], sessions: { garden: gardenSessions }, ...world });
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Garden" }));
  return { host, user };
}

describe("a Journey's sessions", () => {
  it("shows the most recent session when the Journey is picked, read from its file, and opens nothing", async () => {
    const { host } = await gardenOnScreen();

    expect(await within(transcript()).findByText("Planted in the north bed.")).toBeTruthy();
    expect(within(transcript()).getByText("Plant the tomatoes")).toBeTruthy();
    expect(within(transcript()).getByRole("group", { name: "bash tool call" })).toBeTruthy();
    expect(named()).toBe(`Sessions: Plant the tomatoes, ${sessionDate(tomatoes.modified)}`);
    expect(host.requestsOf("session.open")).toEqual([]);
  });

  it("lists New session first, then the Journey's sessions newest first, the shown one marked", async () => {
    const { user } = await gardenOnScreen();
    await within(transcript()).findByText("Planted in the north bed.");

    await user.click(sessionsButton());
    expect(optionTitles()).toEqual(["New session", "Plant the tomatoes", "Prune the roses"]);
    expect(within(listbox()).getByRole("option", { selected: true }).textContent).toBe(`Plant the tomatoes${sessionDate(tomatoes.modified)}`);
    expect(document.activeElement).toBe(listbox());
  });

  it("shows an older session when it is picked, with the count of what came before it; and the shown one again as nothing", async () => {
    const { host, user } = await gardenOnScreen();
    await within(transcript()).findByText("Planted in the north bed.");

    await user.click(sessionsButton());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await within(transcript()).findByText("Cut it back by a third.")).toBeTruthy();
    expect(within(transcript()).getByText("Earlier history in this session is not shown (14 messages).")).toBeTruthy();
    expect(within(transcript()).queryByText("Planted in the north bed.")).toBeNull();
    expect(named()).toBe(`Sessions: Prune the roses, ${sessionDate(roses.modified)}`);
    expect(document.activeElement).toBe(sessionsButton());

    await user.click(sessionsButton());
    await user.click(within(listbox()).getByRole("option", { name: /Prune the roses/ }));
    expect(host.requestsOf("session.transcript")).toHaveLength(2);
    expect(host.requestsOf("session.open")).toEqual([]);
  });

  it("closes on Escape, and on a click outside it, picking nothing", async () => {
    const { host, user } = await gardenOnScreen();
    await within(transcript()).findByText("Planted in the north bed.");

    await user.click(sessionsButton());
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(sessionsButton());

    await user.click(sessionsButton());
    await user.click(transcript());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(host.requestsOf("session.transcript")).toHaveLength(1);
  });

  it("resumes the shown session on the first send: the turn follows what was read", async () => {
    const { host, user } = await gardenOnScreen({ turns: [{ prompt: "And the peppers?", events: briefAnswer("And the peppers?", "Beside the tomatoes.") }] });
    await within(transcript()).findByText("Planted in the north bed.");

    await user.type(messageBox(), "And the peppers?{Enter}");
    expect(await within(transcript()).findByText("Beside the tomatoes.")).toBeTruthy();
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden", sessionFile: tomatoes.file }]);
    const said = within(transcript()).getAllByText(/Planted in the north bed\.|And the peppers\?|Beside the tomatoes\./).map((element) => element.textContent);
    expect(said).toEqual(["Planted in the north bed.", "And the peppers?", "Beside the tomatoes."]);
    expect(screen.getByText("anthropic/claude-test")).toBeTruthy();
  });

  it("starts a new session after New session: an empty transcript that says so, and a send that opens with no file, then names it", async () => {
    const { host, user } = await gardenOnScreen({ turns: [{ prompt: "Fresh start", events: briefAnswer("Fresh start", "Ready.") }] });
    await within(transcript()).findByText("Planted in the north bed.");

    await user.click(sessionsButton());
    await user.keyboard("{Home}{Enter}");
    expect(within(transcript()).getByText("A new session in ~/garden. The first message starts it.")).toBeTruthy();
    expect(within(transcript()).queryByText("Planted in the north bed.")).toBeNull();
    expect(named()).toBe("Sessions: New session");

    await user.type(messageBox(), "Fresh start{Enter}");
    await within(transcript()).findByText("Ready.");
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
    await waitFor(() => expect(named()).toMatch(/^Sessions: Fresh start, /));
  });

  it("closes the Journey's open session when the next send opens another", async () => {
    const { host, user } = await gardenOnScreen({
      turns: [
        { prompt: "Hello", events: briefAnswer("Hello", "Hi.") },
        { prompt: "Back to the roses", events: briefAnswer("Back to the roses", "Pruned.") },
      ],
    });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await within(transcript()).findByText("Hi.");
    await screen.findByRole("button", { name: "Garden", busy: false });

    await user.click(sessionsButton());
    await user.click(within(listbox()).getByRole("option", { name: /Prune the roses/ }));
    await within(transcript()).findByText("Cut it back by a third.");
    expect(host.closedSessions).toEqual([]);

    await user.type(messageBox(), "Back to the roses{Enter}");
    await within(transcript()).findByText("Pruned.");
    expect(host.closedSessions).toEqual(["garden-tomatoes"]);
  });

  it("can be read but not picked from while a turn runs, and Escape closes it without stopping the turn", async () => {
    const { host, user } = await gardenOnScreen({ turns: [{ prompt: "Hello", events: loadTurn("streamed-answer"), held: true }] });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });

    await user.click(sessionsButton());
    expect(screen.getByText("Pi is answering. Pick a session when it finishes.")).toBeTruthy();
    expect(within(listbox()).getAllByRole("option").every((option) => option.getAttribute("aria-disabled") === "true")).toBe(true);
    await user.click(within(listbox()).getByRole("option", { name: /Prune the roses/ }));
    expect(host.requestsOf("session.transcript")).toHaveLength(1);

    // Still open: a disabled option picks nothing and closes nothing.
    listbox().focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(host.requestsOf("session.abort")).toEqual([]);

    // Closed, Escape stops the turn as it does anywhere in the window.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(host.requestsOf("session.abort")).toHaveLength(1));
    host.heldTurn().release();
  });

  it("shows a new session for a Journey that has none", async () => {
    const { user } = await gardenOnScreen();
    await user.click(screen.getByRole("button", { name: "Beds" }));

    expect(await within(transcript()).findByText("A new session in ~/beds. The first message starts it.")).toBeTruthy();
    expect(named()).toBe("Sessions: New session");
  });

  it("says when the sessions cannot be read, offers Try again, and still sends, into a new session", async () => {
    const unreadable = { code: "sessions_unreadable", message: "The session folder could not be read: permission denied." } as const;
    const { host, user } = await gardenOnScreen({
      failures: [{ request: "sessions.list", journey: "garden", error: unreadable }],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Hi.") }],
    });

    expect(await within(transcript()).findByText("The sessions in ~/garden could not be read.")).toBeTruthy();
    expect(within(transcript()).getByText(unreadable.message)).toBeTruthy();
    expect(within(transcript()).getByText("The first message starts a new session.")).toBeTruthy();

    host.stopFailing("sessions.list", "garden");
    await user.click(within(transcript()).getByRole("button", { name: "Try again" }));
    expect(await within(transcript()).findByText("Planted in the north bed.")).toBeTruthy();

    await user.click(sessionsButton());
    await user.keyboard("{Home}{Enter}");
    await user.type(messageBox(), "Hello{Enter}");
    await within(transcript()).findByText("Hi.");
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
  });

  it("says when a session cannot be read, and reads it again on Try again", async () => {
    const unreadable = { code: "sessions_unreadable", message: "This session could not be read: its file is not a Pi session Pi can load." } as const;
    const { host, user } = await gardenOnScreen({ failures: [{ request: "session.transcript", journey: "garden", error: unreadable }] });

    expect(await within(transcript()).findByText("This session could not be read.")).toBeTruthy();
    expect(within(transcript()).getByText("The first message still resumes it.")).toBeTruthy();
    host.stopFailing("session.transcript", "garden");
    await user.click(within(transcript()).getByRole("button", { name: "Try again" }));
    expect(await within(transcript()).findByText("Planted in the north bed.")).toBeTruthy();
  });

  it("draws a title as the text it is, never as Markdown", async () => {
    const marked: ScriptedSession = { ...tomatoes, title: "**Plant** the [tomatoes](https://example.test)" };
    await gardenOnScreen({ sessions: { garden: [marked, roses] } });

    await within(transcript()).findByText("Planted in the north bed.");
    expect(sessionsButton().textContent).toBe(`**Plant** the [tomatoes](https://example.test)${sessionDate(tomatoes.modified)}`);
    expect(within(sessionsButton()).queryByRole("link")).toBeNull();
  });
});
