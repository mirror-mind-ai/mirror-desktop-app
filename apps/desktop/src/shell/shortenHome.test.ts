import { describe, expect, it } from "vitest";

import { shortenHome } from "./shortenHome.ts";

describe("shortenHome", () => {
  it("shows a path under a home directory from ~", () => {
    expect(shortenHome("/Users/test/garden")).toBe("~/garden");
    expect(shortenHome("/Users/test/garden/beds")).toBe("~/garden/beds");
  });

  it("shows the home directory itself as ~", () => {
    expect(shortenHome("/Users/test")).toBe("~");
    expect(shortenHome("/Users/test/")).toBe("~/");
  });

  it("shows macOS's shared folder whole: it is under /Users but is nobody's home", () => {
    expect(shortenHome("/Users/Shared/garden")).toBe("/Users/Shared/garden");
  });

  it("shows a path outside /Users whole", () => {
    expect(shortenHome("/opt/garden")).toBe("/opt/garden");
    expect(shortenHome("/Users")).toBe("/Users");
  });

  it("does not take a name that only starts like a home for one", () => {
    expect(shortenHome("/Userspace/test/garden")).toBe("/Userspace/test/garden");
  });

  // A known limit, kept visible: the UI does not know whose home is whose, so
  // another person's home on the same Mac reads as the person's own. Only the
  // host knows the real home directory; carrying it is a protocol change.
  it("takes another person's home for the person's own", () => {
    expect(shortenHome("/Users/someone-else/garden")).toBe("~/garden");
  });
});
