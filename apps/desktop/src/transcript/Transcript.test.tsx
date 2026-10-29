import type { SessionEvent } from "@mirror-desktop/protocol";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
/**
 * The turn has settled: Garden is no longer busy. Waited for longer than
 * findBy's default second, because a released turn renders whole at once:
 * the markdown-answer fixture is re-parsed and highlighted at every delta,
 * which took up to two seconds in a full parallel run of the suite.
 */
const idle = () => screen.findByRole("button", { name: "Garden", busy: false }, { timeout: 5_000 });

const isTool = (type: "tool_start" | "tool_end", id: string) => (event: SessionEvent) =>
  event.type === type && event.toolCallId === id;

const isDelta = (start: string) => (event: SessionEvent) => event.type === "text_delta" && event.delta.startsWith(start);

/**
 * The transcript's scroll, which happy-dom does not lay out: a log 400 px tall
 * over `height` px of rows. `scrollTo` lands at the bottom, as an instant
 * scroll does; `scrollUp` is the person moving the view up, firing the scroll
 * event a real view fires.
 */
function scrollOf(log: HTMLElement) {
  const metrics = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 };
  Object.defineProperty(log, "scrollTop", { configurable: true, get: () => metrics.scrollTop, set: (top: number) => void (metrics.scrollTop = top) });
  Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(log, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
  const scrollTo = vi.spyOn(log, "scrollTo").mockImplementation(() => {
    metrics.scrollTop = Math.max(metrics.scrollHeight - metrics.clientHeight, 0);
  });
  return {
    scrollTo,
    grow: (by: number) => void (metrics.scrollHeight += by),
    scrollUp: (by: number) => {
      metrics.scrollTop = Math.max(metrics.scrollTop - by, 0);
      fireEvent.scroll(log);
    },
    /** A scroll event the view fires with nobody moving it, after the rows grew under it. */
    echo: () => fireEvent.scroll(log),
  };
}

const jumpButton = () => screen.queryByRole("button", { name: "Jump to latest" });

describe("an answer in the transcript", () => {
  it("is Markdown while it streams and once it is done, with no syntax shown as text", async () => {
    const { host } = await converse("Show me the tides", loadTurn("markdown-answer"), { held: true });
    const turn = host.heldTurn();

    turn.releaseThrough(isDelta("des\n\n"));
    expect(await within(transcript()).findByRole("heading", { level: 1, name: "Tides" })).toBeTruthy();

    turn.release();
    await idle();
    expect(within(transcript()).getByRole("heading", { level: 2, name: "Steps" })).toBeTruthy();
    expect(within(transcript()).getByRole("link", { name: "the almanac" })).toBeTruthy();
    expect(within(transcript()).getByRole("table")).toBeTruthy();
    const prose = [...transcript().querySelectorAll("h1, h2, h3, p, li, th, td, blockquote")].map((element) => element.textContent).join("\n");
    expect(prose).not.toMatch(/\*\*|`|~~|^#|\]\(/m);
  });

  it("never turns the answer's raw HTML into elements, even with a tag split across deltas", async () => {
    const { host } = await converse("Try the edges", loadTurn("unsafe-answer"), { held: true });
    const turn = host.heldTurn();

    turn.releaseThrough((event) => event.type === "text_delta" && event.delta.endsWith("<scr"));
    expect(await within(transcript()).findByText("<scr")).toBeTruthy();
    expect(transcript().querySelector("script, img, iframe")).toBeNull();

    turn.release();
    await idle();
    expect(within(transcript()).getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(transcript().querySelector("script, img, iframe, [target]")).toBeNull();
    expect([...transcript().querySelectorAll("[href]")].map((link) => link.getAttribute("href"))).toEqual([
      "https://example.test/b",
      "https://elsewhere.test/x",
    ]);
  });
});

describe("following the stream", () => {
  it("follows while the view is at the bottom, holds when the person scrolls up, and offers the way back", async () => {
    const { host, user } = await converse("Show me the tides", loadTurn("markdown-answer"), { held: true });
    const turn = host.heldTurn();
    const view = scrollOf(transcript());

    turn.releaseThrough(isDelta("des\n\n"));
    await within(transcript()).findByRole("heading", { name: "Tides" });
    await waitFor(() => expect(view.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "instant" }));
    expect(jumpButton()).toBeNull();

    // The view's own scroll reports after the rows grew under it: not a move up.
    view.grow(300);
    view.echo();
    expect(jumpButton()).toBeNull();

    view.scrollUp(400);
    expect(await screen.findByRole("button", { name: "Jump to latest" })).toBeTruthy();
    view.scrollTo.mockClear();
    turn.releaseThrough(isDelta("## Steps"));
    await within(transcript()).findByRole("heading", { name: "Steps" });
    expect(view.scrollTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(view.scrollTo).toHaveBeenCalledTimes(1);
    expect(jumpButton()).toBeNull();

    view.scrollTo.mockClear();
    turn.release();
    await idle();
    expect(view.scrollTo).toHaveBeenCalled();
    expect(jumpButton()).toBeNull();
  });

  it("leaves the thinking open under a person who scrolled up, and folds it once they follow again", async () => {
    const { host, user } = await converse("Which bed first?", loadTurn("thinking-answer"), { held: true });
    const turn = host.heldTurn();
    const view = scrollOf(transcript());

    turn.releaseThrough((event) => event.type === "thinking_delta");
    const fold = await screen.findByRole("button", { name: "Thinking…" });
    view.scrollUp(400);
    await screen.findByRole("button", { name: "Jump to latest" });

    turn.releaseThrough((event) => event.type === "text_delta");
    await within(transcript()).findByText("Start with");
    expect(fold.getAttribute("aria-expanded")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Jump to latest" }));
    await waitFor(() => expect(fold.getAttribute("aria-expanded")).toBe("false"));

    turn.release();
    await idle();
  });
});

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
