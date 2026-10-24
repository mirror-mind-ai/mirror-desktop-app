import { describe, expect, it } from "vitest";

import { cssBlock, declarations, offendingClasses, vocabularyOf } from "./tokenScan.ts";

// A stylesheet in the app's shape, small enough to read: the scanner's
// vocabulary comes from whatever the stylesheet defines, never from a list here.
const CSS = `
@theme {
  --color-*: initial;
  --text-*: initial;
  --font-sans: Monaco, monospace;
  --font-mono: Monaco, monospace;
  --font-weight-normal: 400;
  --font-weight-bold: 700;
  --text-ui: 13px;
  --text-ui--line-height: 18px;
  --text-body: 16px;
  --radius-control: 4px;
  --animate-pulse-quiet: pulse-quiet 1.6s ease-in-out infinite;
  @keyframes pulse-quiet {
    50% { opacity: 0.4; }
  }
  --color-canvas: #1e1e2e;
  --color-ink: #dee0e1;
  --color-muted: #9da5a9;
  --color-dim: #7e888e;
  --color-hairline: #35354c;
  --color-hover: rgb(255 255 255 / 0.06);
  --color-accent: #a798d7;
  --color-on-accent: #1e1e2e;
  --color-focus: #5fa8cc;
}

.light {
  --color-canvas: #efeeee;
  --color-ink: #3b3f41;
}
`;

const vocabulary = vocabularyOf(CSS);
const scan = (source: string) => offendingClasses(source, vocabulary);

describe("the stylesheet's vocabulary", () => {
  it("reads each kind of token the stylesheet defines, and nothing it clears", () => {
    expect([...vocabulary.colors].sort()).toEqual(["accent", "canvas", "dim", "focus", "hairline", "hover", "ink", "muted", "on-accent"]);
    expect([...vocabulary.text].sort()).toEqual(["body", "ui"]);
    expect([...vocabulary.fonts].sort()).toEqual(["bold", "mono", "normal", "sans"]);
    expect([...vocabulary.radii]).toEqual(["control"]);
    expect([...vocabulary.animations]).toEqual(["pulse-quiet"]);
  });

  it("reads a block's own declarations, past a nested block", () => {
    const theme = declarations(cssBlock(CSS, "@theme"));
    expect(theme.get("--color-canvas")).toBe("#1e1e2e");
    expect(theme.get("--color-focus")).toBe("#5fa8cc");
    expect(theme.has("50%")).toBe(false);
    expect(declarations(cssBlock(CSS, ".light")).get("--color-ink")).toBe("#3b3f41");
  });

  it("fails loudly on a block the stylesheet does not have", () => {
    expect(() => cssBlock(CSS, ".sepia")).toThrow(/\.sepia/);
  });
});

describe("the class scan", () => {
  it("finds Tailwind's own palette, sizes, radii and animations, which the stylesheet clears", () => {
    expect(
      scan(`<p className="text-red-400 bg-white text-sm rounded-lg animate-spin font-semibold" />`),
    ).toEqual(["text-red-400", "bg-white", "text-sm", "rounded-lg", "animate-spin", "font-semibold"]);
  });

  it("finds token names the stylesheet no longer defines, behind any variant", () => {
    expect(scan(`<p className="bg-card hover:text-foreground border-border focus:ring-ring font-display" />`)).toEqual([
      "bg-card",
      "hover:text-foreground",
      "border-border",
      "focus:ring-ring",
      "font-display",
    ]);
  });

  it("finds arbitrary colors and sizes, which bypass the tokens", () => {
    expect(scan("<p className={`bg-[#ff0000] text-[13px] border-[rgb(0,0,0)]`} />")).toEqual([
      "bg-[#ff0000]",
      "text-[13px]",
      "border-[rgb(0,0,0)]",
    ]);
  });

  it("passes every class that names a token, with its variants and opacity", () => {
    const good =
      "bg-canvas text-ink text-ui text-body text-muted placeholder:text-dim hover:bg-hover bg-accent/40 text-on-accent " +
      "border border-t border-hairline border-t-hairline ring-2 focus-visible:ring-focus outline-none " +
      "rounded-control rounded-full animate-pulse-quiet motion-reduce:animate-none font-mono font-bold font-normal " +
      "text-left truncate size-3.5 max-w-measure bg-transparent";
    expect(scan(`<p className="${good}" />`)).toEqual([]);
  });

  it("reads only string literals, not comments or code", () => {
    const source = `
      // text-red-400 is gone; so is bg-card.
      /* rounded-lg */
      const kind = "text";
      const command = "plugin:window|set_theme";
      const query = "(prefers-color-scheme: dark)";
      <p className={busy ? "text-muted" : "text-sm"} />
    `;
    expect(scan(source)).toEqual(["text-sm"]);
  });
});
