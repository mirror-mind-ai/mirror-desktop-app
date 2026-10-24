import { describe, expect, it } from "vitest";

import { followsAfterScroll, isAtBottom } from "./follow.ts";

// A log 400 px tall showing a 1000 px transcript: the bottom is at 600.
const at = (scrollTop: number, scrollHeight = 1000) => ({ scrollTop, scrollHeight, clientHeight: 400 });

describe("isAtBottom", () => {
  it("is true at the bottom and within a line of it, false beyond", () => {
    expect(isAtBottom(at(600))).toBe(true);
    expect(isAtBottom(at(576))).toBe(true);
    expect(isAtBottom(at(575))).toBe(false);
    expect(isAtBottom(at(0))).toBe(false);
  });

  it("is true when the transcript fits in the log", () => {
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
  });
});

describe("followsAfterScroll", () => {
  it("follows again whenever the view reaches the bottom", () => {
    expect(followsAfterScroll(false, at(600), 100)).toBe(true);
  });

  it("holds when the person scrolls up off the bottom", () => {
    expect(followsAfterScroll(true, at(300), 600)).toBe(false);
  });

  // A stream grows the transcript between the view's own scroll and the
  // event it fires: the event then reads a view off the bottom that nobody
  // moved up. That must not stop the following.
  it("keeps following when the transcript grew under a view that did not move up", () => {
    expect(followsAfterScroll(true, at(600, 1200), 600)).toBe(true);
  });

  it("keeps holding when the person scrolls down but not yet to the bottom", () => {
    expect(followsAfterScroll(false, at(400), 300)).toBe(false);
  });
});
