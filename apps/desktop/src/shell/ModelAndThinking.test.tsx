import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { type ScriptedSession, serveFakeHost, type World } from "../testing/fakeHost.ts";
import { messageBox, transcript } from "../testing/queries.ts";
import { renderApp } from "../testing/renderApp.tsx";
import { briefAnswer, deepModel, garden, model, plainModel } from "../testing/worlds.ts";

const testRef = { provider: "anthropic", id: "claude-test" };
const deepRef = { provider: "anthropic", id: "claude-deep" };
const folder = "/Users/test/.pi/agent/sessions/--Users-test-garden--";

/** Garden's two sessions: tomatoes last run on claude-deep at xhigh, roses with no model recorded. */
const tomatoes: ScriptedSession = {
  file: `${folder}/2025-10-29T09-00-00-000Z_garden-tomatoes.jsonl`,
  id: "garden-tomatoes",
  title: "Plant the tomatoes",
  created: Date.UTC(2025, 9, 29, 9),
  modified: Date.UTC(2025, 9, 29, 12),
  entries: [
    { kind: "user", text: "Plant the tomatoes" },
    { kind: "assistant", text: "Planted in the north bed.", thinking: "", stopReason: "stop" },
  ],
  model: deepRef,
  thinkingLevel: "xhigh",
};
const roses: ScriptedSession = {
  file: `${folder}/2025-10-20T09-00-00-000Z_garden-roses.jsonl`,
  id: "garden-roses",
  title: "Prune the roses",
  created: Date.UTC(2025, 9, 20, 9),
  modified: Date.UTC(2025, 9, 20, 12),
  entries: [
    { kind: "user", text: "Prune the roses" },
    { kind: "assistant", text: "Cut back by a third.", thinking: "", stopReason: "stop" },
  ],
};

const modelButton = () => screen.getByRole("button", { name: /^Model: / });
const thinkingButton = () => screen.getByRole("button", { name: /^Thinking: / });
const sessionsButton = () => screen.getByRole("button", { name: /^Sessions: / });
const modelsList = () => screen.getByRole("listbox", { name: "Models" });
const levelsList = () => screen.getByRole("listbox", { name: "Thinking levels" });
/** The options of a list, each by its text, top to bottom. */
const optionTexts = (list: HTMLElement) => within(list).getAllByRole("option").map((option) => option.textContent);

async function gardenOnScreen(world: Partial<World> = {}) {
  const host = serveFakeHost({ models: [model, deepModel, plainModel], journeys: [garden], turns: [], sessions: { garden: [tomatoes, roses] }, ...world });
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByRole("button", { name: "Garden" }));
  return { host, user };
}

/** Garden showing a new session, its defaults on screen. */
async function newSessionOnScreen(world: Partial<World> = {}) {
  const shown = await gardenOnScreen({ sessions: {}, ...world });
  await within(transcript()).findByText("A new session in ~/garden. The first message starts it.");
  await screen.findByRole("button", { name: /^Model: / });
  return shown;
}

describe("the model and thinking in the conversation's header", () => {
  it("says what the session shown runs on before anything opens: a file's own, and the defaults for a new session", async () => {
    const { host, user } = await gardenOnScreen();
    await within(transcript()).findByText("Planted in the north bed.");

    expect(await screen.findByRole("button", { name: "Model: anthropic/claude-deep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thinking: xhigh" })).toBeTruthy();
    expect(screen.getByText("thinking xhigh")).toBeTruthy();

    await user.click(sessionsButton());
    await user.keyboard("{Home}{Enter}");
    expect(await screen.findByRole("button", { name: "Model: anthropic/claude-test" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thinking: medium" })).toBeTruthy();
    expect(host.requestsOf("session.open")).toEqual([]);
  });

  it("lists the models with their providers and Pi's default marked, and only the model's levels, with Pi's words", async () => {
    const { user } = await newSessionOnScreen();

    await user.click(modelButton());
    expect(optionTexts(modelsList())).toEqual(["claude-testanthropicdefault", "claude-deepanthropic", "claude-plainanthropic"]);
    expect(within(modelsList()).getByRole("option", { selected: true }).textContent).toBe("claude-testanthropicdefault");
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Filter models" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(modelButton());

    await user.click(thinkingButton());
    expect(optionTexts(levelsList())).toEqual([
      "offNo reasoning",
      "minimalVery brief reasoning (~1k tokens)",
      "lowLight reasoning (~2k tokens)",
      "mediumModerate reasoning (~8k tokens)default",
      "highDeep reasoning (~16k tokens)",
    ]);
    expect(within(levelsList()).getByRole("option", { selected: true }).textContent).toMatch(/^medium/);
    expect(screen.getByText("Takes effect with your first message.")).toBeTruthy();
  });

  it("narrows the models as the person types, and picks among what is left by the keys", async () => {
    const { host, user } = await newSessionOnScreen();
    await user.click(modelButton());
    const filter = screen.getByRole("combobox", { name: "Filter models" });
    await user.keyboard("deep");
    expect(optionTexts(modelsList())).toEqual(["claude-deepanthropic"]);
    expect(filter.getAttribute("aria-activedescendant")).toBe(within(modelsList()).getByRole("option").id);

    await user.clear(filter);
    await user.keyboard("anthropic claude-p");
    expect(optionTexts(modelsList())).toEqual(["claude-plainanthropic"]);
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-plain");

    await user.click(modelButton());
    expect(screen.getByRole("combobox", { name: "Filter models" })).toHaveProperty("value", "");
    await user.keyboard("gpt");
    expect(within(modelsList()).queryAllByRole("option")).toEqual([]);
    expect(within(modelsList()).getByText("No model matches.")).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-plain");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(modelButton());
    expect(host.requestsOf("session.configure")).toEqual([]);
  });

  it("closes the filtered list on Escape without stopping a running turn", async () => {
    const { host, user } = await gardenOnScreen({ turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning."), held: true }] });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });
    await user.click(modelButton());
    await user.keyboard("test{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(host.requestsOf("session.abort")).toEqual([]);
    host.heldTurn().release();
    await within(transcript()).findByText("Good morning.");
  });

  it("holds a pick before the first send, drawn as held, sends nothing for it, and carries it on the open", async () => {
    const { host, user } = await newSessionOnScreen({ turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }] });

    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-deep/ }));
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-deep");
    expect(modelButton().className).toContain("text-ink");
    await user.click(thinkingButton());
    await user.click(within(levelsList()).getByRole("option", { name: /^max/ }));
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: max");
    expect(thinkingButton().className).toContain("text-ink");
    expect(host.requestsOf("session.open")).toEqual([]);
    expect(host.requestsOf("session.configure")).toEqual([]);

    await user.type(messageBox(), "Hello{Enter}");
    await within(transcript()).findByText("Good morning.");
    expect(host.requestsOf("session.open")).toEqual([{ type: "session.open", journey: "garden", model: deepRef, thinkingLevel: "max" }]);
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-deep");
    expect(modelButton().className).toContain("text-muted");
  });

  it("drops a pick never sent when another session is shown", async () => {
    const { user } = await gardenOnScreen();
    await within(transcript()).findByText("Planted in the north bed.");
    await user.click(await screen.findByRole("button", { name: "Model: anthropic/claude-deep" }));
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-test/ }));
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-test");
    // xhigh is not one of claude-test's: the level moved, and the screen said so.
    expect(await screen.findByText("claude-test has no xhigh; thinking is now high.")).toBeTruthy();

    await user.click(sessionsButton());
    await user.click(screen.getByRole("option", { name: /Prune the roses/ }));
    await within(transcript()).findByText("Cut back by a third.");
    await user.click(sessionsButton());
    await user.click(screen.getByRole("option", { name: /Plant the tomatoes/ }));
    await within(transcript()).findByText("Planted in the north bed.");
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-deep");
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: xhigh");
  });

  it("says where a model pick moved the level, because the model lacks the one shown", async () => {
    const { user } = await newSessionOnScreen({ defaults: { garden: { model: testRef, thinkingLevel: "off" } } });
    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-deep/ }));
    expect(await screen.findByText("claude-deep has no off; thinking is now low.")).toBeTruthy();
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: low");
  });

  it("changes the open session through session.configure, both controls busy until the host answers", async () => {
    const { host, user } = await gardenOnScreen({ heldConfigures: ["garden"], turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }] });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await within(transcript()).findByText("Good morning.");
    await screen.findByRole("button", { name: "Garden", busy: false });

    await user.click(thinkingButton());
    expect(screen.queryByText("Takes effect with your first message.")).toBeNull();
    await user.click(within(levelsList()).getByRole("option", { name: /^low/ }));
    await waitFor(() => expect(host.requestsOf("session.configure")).toHaveLength(1));
    expect(host.requestsOf("session.configure")).toEqual([{ type: "session.configure", sessionId: "garden-tomatoes", model: deepRef, thinkingLevel: "low" }]);
    expect(modelButton().getAttribute("aria-busy")).toBe("true");
    expect(thinkingButton().getAttribute("aria-busy")).toBe("true");
    // Busy, not disabled: the keyboard's focus stays on the control the pick came from.
    expect(thinkingButton().getAttribute("aria-disabled")).toBe("true");
    expect((thinkingButton() as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(thinkingButton());
    await user.click(modelButton());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: xhigh");

    host.heldConfigure("garden").release();
    await waitFor(() => expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: low"));
    expect(thinkingButton().getAttribute("aria-busy")).toBe("false");
    expect(thinkingButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("says a refused change once, in the host's words, and keeps what the session runs on", async () => {
    const refused = { code: "model_not_available", message: "No credential for anthropic: sign in first." } as const;
    const { user } = await gardenOnScreen({
      failures: [{ request: "session.configure", journey: "garden", error: refused }],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
    });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await within(transcript()).findByText("Good morning.");

    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-test/ }));
    expect(await screen.findByText(refused.message)).toBeTruthy();
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-deep");
  });

  it("puts the message back, keeps the pick marked, and says to pick another model when the open refuses it", async () => {
    const refused = { code: "model_not_available", message: "No credential for anthropic: sign in first." } as const;
    const { host, user } = await newSessionOnScreen({
      failures: [{ request: "session.open", journey: "garden", error: refused }],
      turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }],
    });
    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-deep/ }));
    await user.type(messageBox(), "Hello{Enter}");

    expect(await within(transcript()).findByText("Your message is back in the composer. Pick another model, then send again.")).toBeTruthy();
    expect(within(transcript()).getByText(refused.message)).toBeTruthy();
    expect(messageBox().value).toBe("Hello");
    expect(modelButton().getAttribute("aria-label")).toBe("Model: anthropic/claude-deep");
    expect(modelButton().className).toContain("text-danger");

    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-test/ }));
    expect(modelButton().className).not.toContain("text-danger");

    // Back on the defaults, nothing is held: the retry opens on Pi's own default.
    host.stopFailing("session.open", "garden");
    await user.type(messageBox(), "{Enter}");
    await within(transcript()).findByText("Good morning.");
    expect(host.requestsOf("session.open").at(-1)).toEqual({ type: "session.open", journey: "garden" });
    expect(modelButton().getAttribute("aria-label")).toBe(`Model: ${testRef.provider}/${testRef.id}`);
  });

  it("shows no thinking for a model that does not reason", async () => {
    const { user } = await newSessionOnScreen();
    await user.click(modelButton());
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-plain/ }));
    expect(screen.getByText("no thinking")).toBeTruthy();
    expect(screen.getByText("no thinking").getAttribute("title")).toBe("This model does not reason.");
    expect(screen.queryByRole("button", { name: /^Thinking: / })).toBeNull();
  });

  it("says Pi's default when Pi's settings name no model it can use, and asks for a model before a level", async () => {
    const { user } = await newSessionOnScreen({ defaults: { garden: { thinkingLevel: "medium" } } });
    expect(modelButton().getAttribute("aria-label")).toBe("Model: Pi's default");
    expect(screen.getByText("thinking …").getAttribute("title")).toBe("Pick a model to choose its thinking level.");
    expect(screen.queryByRole("button", { name: /^Thinking: / })).toBeNull();

    await user.click(modelButton());
    expect(within(modelsList()).queryByRole("option", { selected: true })).toBeNull();
    await user.click(within(modelsList()).getByRole("option", { name: /^claude-deep/ }));
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: medium");
  });

  it("keeps placeholders where the Journey's sessions could not be read, and the values once they are", async () => {
    const unreadable = { code: "sessions_unreadable", message: "The session folder could not be read: permission denied." } as const;
    const { host, user } = await gardenOnScreen({ failures: [{ request: "sessions.list", journey: "garden", error: unreadable }] });
    expect(await within(transcript()).findByText(unreadable.message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Model: reading…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Thinking: reading…" })).toHaveProperty("disabled", true);

    host.stopFailing("sessions.list", "garden");
    await user.click(within(transcript()).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Model: anthropic/claude-deep" })).toBeTruthy();
  });

  it("shows Pi's line where a resumed file's model could not be restored", async () => {
    const far: ScriptedSession = { ...roses, model: { provider: "faraway", id: "far-1" }, thinkingLevel: "high" };
    const { user } = await gardenOnScreen({ sessions: { garden: [far] }, turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }] });
    await within(transcript()).findByText("Cut back by a third.");
    expect(await screen.findByRole("button", { name: "Model: anthropic/claude-test" })).toBeTruthy();

    await user.type(messageBox(), "Hello{Enter}");
    expect(await within(transcript()).findByText("Could not restore model faraway/far-1. Using anthropic/claude-test")).toBeTruthy();
  });

  it("takes a change while a turn runs, says when it takes effect, and closes on Escape without stopping the turn", async () => {
    const { host, user } = await gardenOnScreen({ turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning."), held: true }] });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await screen.findByRole("button", { name: "Stop" });

    await user.click(thinkingButton());
    expect(screen.getByText("Pi takes it at its next request in this run, or at your next message.")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(host.requestsOf("session.abort")).toEqual([]);

    await user.click(thinkingButton());
    await user.click(within(levelsList()).getByRole("option", { name: /^high/ }));
    await waitFor(() => expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: high"));
    expect(host.requestsOf("session.configure")).toEqual([{ type: "session.configure", sessionId: "garden-tomatoes", model: deepRef, thinkingLevel: "high" }]);
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();

    host.heldTurn().release();
    await within(transcript()).findByText("Good morning.");
  });

  it("shows what was picked while the session opens, and takes no pick then", async () => {
    const { host, user } = await gardenOnScreen({ heldOpens: ["garden"], turns: [{ prompt: "Hello", events: briefAnswer("Hello", "Good morning.") }] });
    await within(transcript()).findByText("Planted in the north bed.");
    await user.type(messageBox(), "Hello{Enter}");
    await waitFor(() => expect(host.requestsOf("session.open")).toHaveLength(1));

    await user.click(thinkingButton());
    expect(screen.getByText("Opening the session…")).toBeTruthy();
    const low = within(levelsList()).getByRole("option", { name: /^low/ });
    expect(low.getAttribute("aria-disabled")).toBe("true");
    await user.click(low);
    expect(thinkingButton().getAttribute("aria-label")).toBe("Thinking: xhigh");

    host.heldOpen("garden").release();
    await within(transcript()).findByText("Good morning.");
    expect(host.requestsOf("session.configure")).toEqual([]);
  });
});
