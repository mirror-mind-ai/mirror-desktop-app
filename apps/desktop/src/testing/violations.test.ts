import { describe, expect, it } from "vitest";

import { record, take, verify } from "./violations.ts";

describe("the violation recorder", () => {
  it("passes when nothing was recorded", () => {
    expect(() => verify()).not.toThrow();
  });

  it("fails listing every violation by kind and detail, then starts empty", () => {
    record("network", "fetch https://example.com/");
    record("unscripted", "session.abort for session-1");
    expect(() => verify()).toThrow(
      /2 violation\(s\)[\s\S]*network: fetch https:\/\/example\.com\/[\s\S]*unscripted: session\.abort for session-1/,
    );
    expect(() => verify()).not.toThrow();
  });

  it("hands its violations to a test that expects them, leaving nothing for teardown", () => {
    record("ipc", "plugin:opener|open_url");
    expect(take()).toEqual([{ kind: "ipc", detail: "plugin:opener|open_url" }]);
    expect(take()).toEqual([]);
  });
});
