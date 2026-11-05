import { describe, expect, it } from "vitest";

import { afterEvent, answered, type LiveTurn, lostWithTheHost, QUIET, returnToDraft, type Sending } from "./liveTurn.ts";

const turn = (overrides: Partial<LiveTurn> = {}): LiveTurn => ({ ...QUIET, draft: "", ...overrides });
const steer = (text: string, deferred?: Sending["deferred"]): Sending => ({ text, behavior: "steer", ...(deferred ? { deferred } : {}) });

describe("returning to the draft", () => {
  it("puts the returned texts first, then the draft, joined by blank lines, dropping blank ones", () => {
    expect(returnToDraft(["a", "b"], "c")).toBe("a\n\nb\n\nc");
    expect(returnToDraft(["a", "b"], "")).toBe("a\n\nb");
    expect(returnToDraft(["  ", "a"], "  \n")).toBe("a");
    expect(returnToDraft([], "typed")).toBe("typed");
  });
});

describe("Pi's events in a running turn", () => {
  it("runs from agent_start, whoever began the run, and moves a waiting deferred message into it", () => {
    const { changes, draws } = afterEvent(turn({ sending: [steer("a", "waiting"), steer("b")] }), { type: "agent_start" });
    expect(changes).toEqual({ running: true, piRunning: true, sending: [steer("a", "running"), steer("b")] });
    expect(draws).toBe(true);
  });

  it("settles at agent_settled, letting go of a deferred message its run never echoed, and of the echo awaited", () => {
    const { changes } = afterEvent(turn({ running: true, piRunning: true, awaitingEcho: true, sending: [steer("a", "running"), steer("b", "waiting")] }), {
      type: "agent_settled",
      aborted: false,
    });
    expect(changes).toEqual({ running: false, piRunning: false, awaitingEcho: false, sending: [steer("b", "waiting")] });
  });

  it("keeps the queue as Pi's last queue_update said it, and draws nothing for it", () => {
    expect(afterEvent(turn(), { type: "queue_update", steering: ["a"], followUp: ["b"] })).toEqual({
      changes: { queue: { steering: ["a"], followUp: ["b"] } },
      draws: false,
    });
  });

  it("swallows the echo of the store's own prompt, and draws every other user message, no longer sending", () => {
    expect(afterEvent(turn({ awaitingEcho: true }), { type: "message_end", role: "user", text: "Hello" })).toEqual({
      changes: { awaitingEcho: false },
      draws: false,
    });
    expect(afterEvent(turn({ sending: [steer("a"), steer("a")] }), { type: "message_end", role: "user", text: "a" })).toEqual({
      changes: { sending: [steer("a")] },
      draws: true,
    });
  });

  it("leaves the live state to other events, which the transcript draws", () => {
    expect(afterEvent(turn({ awaitingEcho: true }), { type: "message_end", role: "custom", text: "context" })).toEqual({ changes: {}, draws: true });
  });
});

describe("Pi's answer to a message sent into a running turn", () => {
  it("lists it on only when Pi deferred it", () => {
    const sent = steer("a");
    const other = steer("b");
    expect(answered([sent, other], sent, "queued")).toEqual([other]);
    expect(answered([sent, other], sent, "deferred")).toEqual([steer("a", "waiting"), other]);
  });
});

describe("a lost host", () => {
  it("gives back what was queued and what was sending, once each, before what was typed", () => {
    const lost = lostWithTheHost(turn({ queue: { steering: ["a", "c"], followUp: ["b"] }, sending: [steer("c")], awaitingEcho: true, piRunning: true, draft: "d" }));
    expect(lost).toEqual({ queue: { steering: [], followUp: [] }, sending: [], awaitingEcho: false, piRunning: false, draft: "a\n\nc\n\nb\n\nd" });
  });

  it("takes nothing from a turn that held nothing for it", () => {
    expect(lostWithTheHost(turn({ draft: "kept" }))).toBeUndefined();
  });
});
