import type { SessionEvent } from "@mirror-desktop/protocol";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { type ExtensionFailure, type FakeHost, serveFakeHost } from "../testing/fakeHost.ts";
import { exactly, messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { loadTurn } from "../testing/turns.ts";
import { briefAnswer, garden, model } from "../testing/worlds.ts";

/** Pick Garden and send `prompt`, which the host answers with `events`, held when asked. */
async function converse(prompt: string, events: SessionEvent[], options: { held?: boolean; extensionErrors?: ExtensionFailure[] } = {}) {
  const host = serveFakeHost({ models: [model], journeys: [garden], turns: [{ prompt, events, ...options }] });
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Garden" }));
  await user.type(messageBox(), `${prompt}{Enter}`);
  await waitFor(() => expect(host.requestsOf("session.prompt")).toHaveLength(1));
  return { host, user };
}

const settled = (host: FakeHost) => waitFor(() => expect(host.heldTurn().remaining).toBe(0));
const idle = () => screen.findByRole("button", { name: "Garden", busy: false });

const isTool = (type: "tool_start" | "tool_end", id: string) => (event: SessionEvent) =>
  event.type === type && event.toolCallId === id;

describe("a tool call in the transcript", () => {
  it("is Pi's folded form on the ground of its state, and opens on its arguments and its whole result", async () => {
    const { host, user } = await converse("List the beds", loadTurn("tool-use"), { held: true });
    const turn = host.heldTurn();

    turn.releaseThrough(isTool("tool_start", "call-1"));
    const running = await screen.findByRole("group", { name: "bash tool call" });
    const toggle = within(running).getByRole("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain('command="ls /Users/test/garden/beds"');
    expect(within(running).getByRole("img", { name: "running" })).toBeTruthy();
    expect(running.className).toContain("bg-tool-pending");

    turn.releaseThrough(isTool("tool_end", "call-1"));
    const mark = await within(running).findByRole("img", { name: "succeeded" });
    expect(mark.className).toContain("text-success");
    expect(running.className).toContain("bg-tool-success");
    expect(within(running).getByText("4.2s")).toBeTruthy();
    const preview = within(running).getByText(/^bed-01/);
    expect(preview.textContent?.split("\n")).toEqual(Array.from({ length: 10 }, (_, index) => `bed-${String(index + 1).padStart(2, "0")}`));
    expect(preview.className).toContain("text-muted");
    expect(within(running).getByText("… 2 more lines")).toBeTruthy();

    turn.release();
    await idle();
    const [, failed] = screen.getAllByRole("group", { name: "bash tool call" });
    expect(within(failed as HTMLElement).getByRole("img", { name: "failed" }).className).toContain("text-danger");
    expect(failed?.className).toContain("bg-tool-error");
    expect(within(failed as HTMLElement).getByText("ls: /Users/test/garden/greenhouse: No such file or directory")).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(running).getByText("command")).toBeTruthy();
    expect(within(running).getByText("ls /Users/test/garden/beds")).toBeTruthy();
    expect(within(running).getByText(/bed-12$/)).toBeTruthy();
    expect(within(running).queryByText(/more lines/)).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(running).queryByText(/bed-12/)).toBeNull();
    expect(within(transcript()).getByText("Twelve beds, and no greenhouse yet.")).toBeTruthy();
  });
});

describe("a model's thinking in the transcript", () => {
  it("shows open while it streams, folds once the answer begins, and opens again on a click", async () => {
    const { host, user } = await converse("Which bed first?", loadTurn("thinking-answer"), { held: true });
    const turn = host.heldTurn();

    turn.releaseThrough((event) => event.type === "thinking_delta");
    const fold = await screen.findByRole("button", { name: "Thinking…" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    const thought = within(transcript()).getByText("The north bed gets");
    expect(thought.className).toContain("text-thinking");
    expect(thought.className).toContain("italic");

    turn.releaseThrough((event) => event.type === "text_delta");
    await waitFor(() => expect(fold.getAttribute("aria-expanded")).toBe("false"));
    expect(within(transcript()).queryByText(/The north bed/)).toBeNull();

    turn.release();
    await settled(host);
    const done = await screen.findByRole("button", { name: "Thought" });
    expect(done.getAttribute("aria-expanded")).toBe("false");
    expect(within(transcript()).getByText("Start with the north bed.")).toBeTruthy();

    await user.click(done);
    expect(done.getAttribute("aria-expanded")).toBe("true");
    expect(within(transcript()).getByText(exactly("The north bed gets the morning sun.\nStart there."))).toBeTruthy();
  });
});

describe("a notice in the transcript", () => {
  /** The notice whose name is `name`, read whole. */
  const notice = (name: string) => {
    const paragraph = within(transcript()).getByText(name).closest("p");
    if (!paragraph) throw new Error(`No notice named ${name}.`);
    return paragraph;
  };

  it("names a retry in the notice color, after the attempt that failed, before the answer that came", async () => {
    const { host } = await converse("Water the beds", loadTurn("retried-answer"));
    await idle();
    expect(host.requestsOf("session.prompt")).toHaveLength(1);

    const failed = notice("Provider error");
    const retry = notice("Retry 1 of 3");
    expect(failed.textContent).toBe("Provider error · overloaded");
    expect(failed.className).toContain("text-danger");
    expect(retry.textContent).toBe("Retry 1 of 3 · overloaded · retrying in 2s");
    expect(retry.className).toContain("text-notice");
    const answer = within(transcript()).getByText("Watered.");
    expect(failed.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(retry.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names a provider's error in the danger color, after what the answer had streamed", async () => {
    await converse("Plant the seeds", loadTurn("provider-error"));
    await idle();
    const failed = notice("Provider error");
    expect(failed.textContent).toBe("Provider error · The provider closed the stream.");
    expect(failed.className).toContain("text-danger");
    const partial = within(transcript()).getByText("Planting the first row");
    expect(partial.compareDocumentPosition(failed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names an extension's failure in the notice color, and the turn goes on", async () => {
    const failure = { extension: "mirror", event: "before_agent_start", message: "the database is locked" };
    await converse("Hello", briefAnswer("Hello", "Good morning."), { extensionErrors: [failure] });
    await idle();
    const failed = notice("Extension failed");
    expect(failed.textContent).toBe("Extension failed · mirror on before_agent_start: the database is locked");
    expect(failed.className).toContain("text-notice");
    expect(within(transcript()).getByText("Good morning.")).toBeTruthy();
  });
});
