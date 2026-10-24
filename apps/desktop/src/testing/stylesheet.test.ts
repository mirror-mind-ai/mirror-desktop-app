import { describe, expect, it } from "vitest";

import { appStylesheet, declaredValue, rulesOf, specificityOf } from "./stylesheet.ts";

const css = `
@import "tailwindcss";
@theme { --color-ink: #fff; @keyframes pulse { 50% { opacity: 0.4; } } }
/* a comment { with a brace } */
.code .word { color: red; }
.code .word.special, .other { color: blue; font-style: italic; }
.code .word { color: green; }
`;

function element(html: string): Element {
  document.body.innerHTML = html;
  const found = document.body.querySelector("[data-probe]");
  if (!found) throw new Error("no probe");
  return found;
}

describe("rulesOf", () => {
  it("reads the plain rules in order, skipping at-rules and comments", () => {
    const rules = rulesOf(css);
    expect(rules.map((rule) => rule.selectors)).toEqual([[".code .word"], [".code .word.special", ".other"], [".code .word"]]);
    expect(rules[1]?.declarations.get("font-style")).toBe("italic");
  });

  it("reads the app's own stylesheet", () => {
    expect(rulesOf(appStylesheet()).some((rule) => rule.selectors.includes(".hljs .hljs-title"))).toBe(true);
  });
});

describe("declaredValue", () => {
  const rules = rulesOf(css);

  it("lets the later of two equally specific rules win", () => {
    expect(declaredValue(element('<div class="code"><span class="word" data-probe></span></div>'), rules, "color")).toBe("green");
  });

  it("lets the more specific rule win, wherever it stands", () => {
    expect(declaredValue(element('<div class="code"><span class="word special" data-probe></span></div>'), rules, "color")).toBe("blue");
  });

  it("is undefined where no rule matches the element itself", () => {
    expect(declaredValue(element('<div class="code word"><span data-probe></span></div>'), rules, "color")).toBeUndefined();
  });
});

describe("specificityOf", () => {
  it("counts ids, then classes, attributes and pseudo-classes, then types", () => {
    expect(specificityOf(".hljs .hljs-variable.language_")).toEqual([0, 3, 0]);
    expect(specificityOf("html [data-sonner-toaster][data-type=\"error\"]")).toEqual([0, 2, 1]);
    expect(specificityOf("#root")).toEqual([1, 0, 0]);
    expect(specificityOf(":root.light")).toEqual([0, 2, 0]);
  });
});
