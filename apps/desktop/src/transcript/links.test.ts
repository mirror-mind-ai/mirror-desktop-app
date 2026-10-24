import { describe, expect, it } from "vitest";

import { keepHttps, lureHost } from "./links.ts";

describe("keepHttps", () => {
  it("keeps an https URL and drops every other target", () => {
    expect(keepHttps("https://example.test/a")).toBe("https://example.test/a");
    expect(keepHttps("HTTPS://example.test/a")).toBe("HTTPS://example.test/a");
    for (const url of ["http://example.test", "mailto:a@example.test", "tel:123", "javascript:alert(1)", "data:text/html,hi", "src/App.tsx", "#top", "//example.test", "https:", ""]) {
      expect(keepHttps(url), url).toBeNull();
    }
  });
});

describe("lureHost", () => {
  it("names the target's host when the link's text is a URL to another host", () => {
    expect(lureHost("example.test/docs", "https://elsewhere.test/x")).toBe("elsewhere.test");
    expect(lureHost("https://good.example/login", "https://evil.example/login")).toBe("evil.example");
  });

  it("names nothing when the text is not a URL, or is one to the same host", () => {
    expect(lureHost("the almanac", "https://example.test/almanac")).toBeUndefined();
    expect(lureHost("https://example.test/a", "https://example.test/b")).toBeUndefined();
    expect(lureHost("www.example.test", "https://example.test/")).toBeUndefined();
    expect(lureHost("Example.Test", "https://example.test/")).toBeUndefined();
  });

  it("names a look-alike host as the browser will reach it", () => {
    // A Cyrillic "а" where the text has a Latin "a".
    expect(lureHost("apple.example", "https://\u0430pple.example/")).toBe("xn--pple-43d.example");
  });
});
