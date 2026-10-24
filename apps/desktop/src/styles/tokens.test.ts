import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cssBlock, declarations, offendingClasses, vocabularyOf } from "../testing/tokenScan.ts";
import { CANVAS } from "../theme/resolve.ts";

// From disk: vitest hands a test every CSS import empty, `?raw` included. And not
// through `new URL("./app.css", import.meta.url)`, which Vite rewrites into an
// asset URL on the page's origin.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "app.css"), "utf8");

// The app's own sources: everything under src/ except tests and the harness.
const SOURCES = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!../testing/**"], {
  eager: true,
  query: "?raw",
  import: "default",
});

const colorTokens = (header: string) =>
  [...declarations(cssBlock(css, header)).keys()].filter((name) => name.startsWith("--color-") && name !== "--color-*").sort();

describe("the stylesheet", () => {
  it("overrides in .light every color @theme defines, and defines no other", () => {
    const dark = colorTokens("@theme");
    expect(dark.length).toBeGreaterThanOrEqual(16);
    expect(colorTokens(".light")).toEqual(dark);
  });

  it("paints each canvas the color the window is told", () => {
    expect(declarations(cssBlock(css, "@theme")).get("--color-canvas")).toBe(CANVAS.dark);
    expect(declarations(cssBlock(css, ".light")).get("--color-canvas")).toBe(CANVAS.light);
  });

  // The Navigator's request for CV1.DS1.US2, in Pi's values (D15): what the
  // transcript's Markdown must read as. An element is held to its token's class
  // by the transcript's own tests; the token is held to Pi's value here.
  it("carries the Markdown colors the Navigator's request names, as Pi draws them", () => {
    const markdown = (header: string) => {
      const tokens = declarations(cssBlock(css, header));
      return ["heading", "code", "list-marker", "link", "code-block"].map((role) => tokens.get(`--color-${role}`));
    };
    expect(markdown("@theme")).toEqual(["#cd9a22", "#a798d7", "#a798d7", "#69add0", "#68b78d"]);
    expect(markdown(".light")).toEqual(["#8f6802", "#7459b4", "#7459b4", "#2f7899", "#337e58"]);
  });

  it("uses only the colors it defines", () => {
    const defined = new Set(colorTokens("@theme"));
    const used = [...css.matchAll(/var\((--color-[a-z-]+)\)/g)].map((match) => match[1] ?? "");
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });
});

describe("the app's classes", () => {
  it("are read from the app's sources, so the check below cannot pass on nothing", () => {
    expect(Object.keys(SOURCES)).toEqual(expect.arrayContaining(["../shell/Sidebar.tsx", "../shell/Composer.tsx", "../SignIn.tsx"]));
  });

  it("name only colors, type, weights, radii and animations the stylesheet defines", () => {
    const vocabulary = vocabularyOf(css);
    const offending = Object.entries(SOURCES).flatMap(([file, source]) =>
      offendingClasses(source, vocabulary).map((name) => `${file.slice(3)}: ${name}`),
    );
    expect(offending).toEqual([]);
  });
});
