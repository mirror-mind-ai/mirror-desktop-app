// The stylesheet as tests read it: app.css from disk, its plain rules, and
// which of them decides a property for an element the app rendered.
//
// happy-dom applies no CSS, and vitest hands a test every CSS import empty,
// so a test that must prove an element is styled by a rule the stylesheet
// actually defines (the highlight mapping, carried from Pi) reads the rules
// itself and matches them with the element's own `matches()`. The cascade it
// models is the part those rules need: the highest specificity wins, then the
// later rule. At-rules (@theme, @import, @custom-variant) are skipped; their
// tokens are read by tokenScan.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { declarations } from "./tokenScan.ts";

export interface StyleRule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

/** app.css, read from disk: vitest serves CSS imports empty, `?raw` included. */
export function appStylesheet(): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles/app.css"), "utf8");
}

/** The stylesheet's top-level plain rules, in order. */
export function rulesOf(css: string): StyleRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: StyleRule[] = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === ";") {
      prelude = ""; // a statement at-rule, such as @import
    } else if (char === "{") {
      const close = closingBrace(text, index);
      if (!prelude.trim().startsWith("@")) {
        rules.push({
          selectors: prelude.split(",").map((selector) => selector.trim()).filter(Boolean),
          declarations: declarations(text.slice(index + 1, close)),
        });
      }
      prelude = "";
      index = close;
    } else {
      prelude += char;
    }
  }
  return rules;
}

/**
 * The value `rules` give `property` on `element` itself, by the cascade: the
 * most specific matching selector wins, a later rule breaks a tie. Undefined
 * when no rule sets it there; an inherited value is not this element's.
 */
export function declaredValue(element: Element, rules: readonly StyleRule[], property: string): string | undefined {
  let winner: { value: string; specificity: readonly number[] } | undefined;
  for (const rule of rules) {
    const value = rule.declarations.get(property);
    if (value === undefined) continue;
    for (const selector of rule.selectors) {
      if (!matches(element, selector)) continue;
      const specificity = specificityOf(selector);
      if (!winner || compare(specificity, winner.specificity) >= 0) winner = { value, specificity };
    }
  }
  return winner?.value;
}

/** Specificity as (ids, classes and attributes and pseudo-classes, types) for the simple selectors this stylesheet writes. */
export function specificityOf(selector: string): [number, number, number] {
  const withoutPseudoElements = selector.replace(/::[a-z-]+/g, "");
  const ids = withoutPseudoElements.match(/#[\w-]+/g)?.length ?? 0;
  const classes = withoutPseudoElements.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const types = withoutPseudoElements.replace(/\[[^\]]*\]/g, "").match(/(?:^|[\s>+~(])([a-z][\w-]*)/gi)?.length ?? 0;
  return [ids, classes, types];
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false; // a pseudo-element or a selector the DOM cannot match on an element
  }
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("The stylesheet has a block that never closes.");
}
