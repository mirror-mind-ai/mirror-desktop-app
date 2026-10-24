import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { serveFakeHost } from "../testing/fakeHost.ts";
import { exactly, messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { assistantTextOf, loadTurn } from "../testing/turns.ts";
import { beds, briefAnswer, garden, model } from "../testing/worlds.ts";

const streamedAnswer = loadTurn("streamed-answer");
const answer = assistantTextOf(streamedAnswer);

describe("a Journey's conversation", () => {
  it("opens the session on the first send, then shows where it runs, its model and its thinking", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
      // Not where the Journey is listed: the header must report the session's answer, not repeat the list.
      sessionCwds: { garden: "/Users/test/gardens/garden" },
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    expect(screen.getByText("~/garden")).toBeTruthy();
    expect(screen.queryByText("anthropic/claude-test")).toBeNull();

    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText("~/gardens/garden");
    expect(screen.queryByText("~/garden")).toBeNull();
    expect(screen.getByText("anthropic/claude-test")).toBeTruthy();
    expect(screen.getByText("thinking medium")).toBeTruthy();
    await screen.findByText("Good morning.");
    await screen.findByRole("button", { name: "Garden", busy: false });

    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden" }]);
    expect(host.requestsOf("session.prompt")).toEqual([{ type: "session.prompt", sessionId: "session-1", text: "Hello" }]);
  });

  it("keeps each Journey's conversation, draft and stream across switches, and marks the one still working", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden, beds],
      turns: [
        { prompt: "Hello", events: streamedAnswer, held: true },
        { prompt: "Plant", events: briefAnswer("Plant", "Seeds sown.") },
      ],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });
    expect(screen.getByRole("button", { name: "Garden", busy: true, description: /Working/ })).toBeTruthy();
    await user.type(messageBox(), "Water the beds");

    await user.click(screen.getByRole("button", { name: "Beds" }));
    expect(screen.getByRole("heading", { name: "Beds" })).toBeTruthy();
    expect(messageBox().value).toBe("");
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(within(transcript()).queryByText("Hello")).toBeNull();

    await user.type(messageBox(), "Plant{Enter}");
    await screen.findByText("Seeds sown.");
    await screen.findByRole("button", { name: "Beds", busy: false });

    // Garden's turn plays out while Beds is on screen. Its item settling is the
    // proof the whole turn arrived, before anything is said about Beds.
    await waitFor(() => expect(host.requestsOf("session.prompt")).toHaveLength(2));
    host.heldTurn().release();
    await screen.findByRole("button", { name: "Garden", busy: false });
    expect(within(transcript()).queryByText("Hello")).toBeNull();
    expect(within(transcript()).queryByText(exactly(answer), { selector: "p" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Garden" }));
    expect(messageBox().value).toBe("Water the beds");
    expect(within(transcript()).getByText("Hello")).toBeTruthy();
    expect(within(transcript()).getByText(exactly(answer), { selector: "p" })).toBeTruthy();
    expect(within(transcript()).queryByText("Seeds sown.")).toBeNull();

    expect(host.requestsOf("session.open")).toEqual([
      { type: "session.open", journey: "garden" },
      { type: "session.open", journey: "beds" },
    ]);
    expect(host.requestsOf("session.prompt")).toEqual([
      { type: "session.prompt", sessionId: "session-1", text: "Hello" },
      { type: "session.prompt", sessionId: "session-2", text: "Plant" },
    ]);
  });

  it("sends Stop to the session of the Journey on screen", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden, beds],
      turns: [{ prompt: "Hello", events: streamedAnswer, held: true }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });

    await user.click(screen.getByRole("button", { name: "Beds" }));
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Garden" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(host.requestsOf("session.abort")).toEqual([{ type: "session.abort", sessionId: "session-1" }]));

    // What Stop does to the turn is CV1.DS2's; the fake host plays it on.
    await waitFor(() => expect(host.requestsOf("session.prompt")).toHaveLength(1));
    host.heldTurn().release();
    await screen.findByRole("button", { name: "Send" });
  });

  it("keeps the Journey that was picked on screen while another one's session opens", async () => {
    const host = serveFakeHost({
      models: [model],
      journeys: [garden, beds],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
      heldOpens: ["garden"],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    expect(await screen.findByText("Opening in ~/garden…")).toBeTruthy();
    expect(within(transcript()).getByText("Hello")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Garden", busy: true })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Beds" }));
    await waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));
    host.heldOpen("garden").release();
    await screen.findByRole("button", { name: "Garden", busy: false });

    expect(screen.getByRole("button", { name: "Beds", current: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Beds" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Garden" }));
    expect(within(transcript()).getByText("Good morning.")).toBeTruthy();
    expect(screen.queryByText("Opening in ~/garden…")).toBeNull();
  });

  it("names a session that failed to open, gives the message back, and opens on the next send", async () => {
    const failed = { code: "session_open_failed", message: "The project path does not exist." } as const;
    const host = serveFakeHost({
      models: [model],
      journeys: [garden],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
      failures: [{ request: "session.open", journey: "garden", error: failed }],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: "Garden" }));
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByText(failed.message);
    expect(screen.getAllByText(failed.message)).toHaveLength(1);
    expect(screen.getByText("The session could not open in ~/garden.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Garden", current: true, busy: false })).toBeTruthy();
    expect(messageBox().value).toBe("Hello");
    expect(within(transcript()).queryByText("Hello")).toBeNull();

    host.stopFailing("session.open", "garden");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Good morning.");
    expect(screen.queryByText(failed.message)).toBeNull();
    expect(host.requestsOf("session.open")).toHaveLength(2);
    await screen.findByRole("button", { name: "Garden", busy: false });
  });
});
