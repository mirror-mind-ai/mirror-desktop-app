// Holds every class in the app's sources to the stylesheet's vocabulary.
//
// app.css clears Tailwind's own palette, text sizes, weights, radii and
// animations, so a class like `text-red-400` or `text-sm` produces no CSS at
// all: it would fail silently, as an element that lost its color or its size.
// This scan makes it fail loudly, by name. Its vocabulary is read from the
// stylesheet itself, so the two cannot drift; and it reads only string
// literals, through TypeScript's own parser, so a comment or a sentence in JSX
// is never mistaken for a class.

import ts from "typescript";

/** What the stylesheet lets a class name, read from its `@theme` block. */
export interface Vocabulary {
  readonly colors: ReadonlySet<string>;
  readonly text: ReadonlySet<string>;
  /** Families and weights: both are `font-<name>`. */
  readonly fonts: ReadonlySet<string>;
  readonly radii: ReadonlySet<string>;
  readonly animations: ReadonlySet<string>;
}

/** The body of the first block whose header is exactly `header`, nested blocks included. */
export function cssBlock(css: string, header: string): string {
  const start = withoutComments(css).search(new RegExp(`(^|\\n)\\s*${escapeRegExp(header)}\\s*\\{`));
  if (start < 0) throw new Error(`The stylesheet has no "${header}" block.`);
  const text = withoutComments(css);
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  throw new Error(`The stylesheet's "${header}" block never closes.`);
}

/** A block's own declarations, by property, in order; nested blocks (a @keyframes) are skipped. */
export function declarations(block: string): Map<string, string> {
  let own = "";
  let depth = 0;
  for (const char of block) {
    if (char === "{") {
      // What came since the last declaration was the nested block's header.
      own = own.slice(0, own.lastIndexOf(";") + 1);
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    } else if (depth === 0) {
      own += char;
    }
  }
  const result = new Map<string, string>();
  for (const declaration of own.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    result.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  }
  return result;
}

/** The tokens `css` defines in its `@theme` block; a namespace cleared with `*: initial` adds nothing. */
export function vocabularyOf(css: string): Vocabulary {
  const names = [...declarations(cssBlock(css, "@theme")).keys()];
  const tokens = (prefix: string, exclude: (name: string) => boolean = () => false) =>
    new Set(
      names
        .filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length))
        .filter((name) => name !== "*" && !exclude(name)),
    );
  return {
    colors: tokens("--color-"),
    // `--text-ui--line-height` belongs to `text-ui`; it is not a size of its own.
    text: tokens("--text-", (name) => name.includes("--")),
    // `--font-mono` is `font-mono`, and `--font-weight-bold` is `font-bold`.
    fonts: new Set([...tokens("--font-", (name) => name.startsWith("weight-")), ...tokens("--font-weight-")]),
    radii: tokens("--radius-"),
    animations: tokens("--animate-"),
  };
}

/** Every class in `source` that names something the stylesheet does not define, in order. */
export function offendingClasses(source: string, vocabulary: Vocabulary): string[] {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const offending: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const word of node.text.split(/\s+/)) {
        if (word !== "" && !allowed(word, vocabulary)) offending.push(word);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return offending;
}

/** The utilities whose values the stylesheet governs: colors, type, radii, animations. */
const GOVERNED = /^(bg|text|border|ring|outline|fill|stroke|decoration|caret|accent|divide|shadow|rounded|animate|font)(?:-(.+))?$/;

const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  text: ["left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"],
  bg: ["none", "fixed", "local", "scroll", "cover", "contain", "center", "top", "bottom", "left", "right", "auto", "repeat", "no-repeat"],
  border: ["0", "2", "4", "8", "solid", "dashed", "dotted", "double", "hidden", "none"],
  ring: ["0", "1", "2", "4", "8", "inset"],
  outline: ["0", "1", "2", "4", "8", "none", "hidden", "solid", "dashed", "dotted", "double"],
  fill: ["none"],
  stroke: ["none", "0", "1", "2"],
  decoration: ["solid", "double", "dotted", "dashed", "wavy", "auto", "from-font", "0", "1", "2", "4", "8"],
  caret: [],
  accent: ["auto"],
  divide: ["x", "y", "reverse", "0", "2", "4", "8", "solid", "dashed", "dotted", "double", "none"],
  shadow: ["none"],
};

/** Whether `word`, read as a class, names only what the stylesheet defines. Words that are not governed utilities pass. */
function allowed(word: string, vocabulary: Vocabulary): boolean {
  const match = GOVERNED.exec(utilityOf(word));
  if (!match) return true;
  const kind = match[1] ?? "";
  const value = match[2]?.replace(/\/\d+$/, "");
  if (value === undefined) {
    // Bare `border`, `ring` and `outline` are structural; bare `rounded` and
    // `shadow` lean on defaults the stylesheet cleared; other bare words are not classes.
    return kind !== "rounded" && kind !== "shadow";
  }
  if (value.startsWith("[")) return false;
  const color = vocabulary.colors.has(value) || ["transparent", "current", "inherit"].includes(value);
  switch (kind) {
    case "text":
      return color || vocabulary.text.has(value) || (KEYWORDS.text ?? []).includes(value);
    case "font":
      return vocabulary.fonts.has(value);
    case "animate":
      return value === "none" || vocabulary.animations.has(value);
    case "rounded": {
      const radius = /^(?:(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es)-)?(.+)$/.exec(value)?.[1] ?? value;
      return radius === "none" || radius === "full" || vocabulary.radii.has(radius);
    }
    case "border": {
      // A side, alone or with a width, style or color: border-t, border-t-2, border-t-hairline.
      const side = /^(?:t|r|b|l|x|y|s|e)(?:-(.+))?$/.exec(value);
      const rest = side ? side[1] : value;
      return rest === undefined || vocabulary.colors.has(rest) || (KEYWORDS.border ?? []).includes(rest) || ["transparent", "current", "inherit"].includes(rest);
    }
    case "ring":
    case "outline": {
      const offset = /^offset-(.+)$/.exec(value)?.[1];
      if (offset !== undefined) return /^\d+$/.test(offset) || vocabulary.colors.has(offset);
      return color || (KEYWORDS[kind] ?? []).includes(value);
    }
    default:
      return color || (KEYWORDS[kind] ?? []).includes(value);
  }
}

/** The utility a class applies, without its variants (`hover:`, `focus-visible:`), importance or sign. */
function utilityOf(word: string): string {
  let lastColon = -1;
  let depth = 0;
  for (let index = 0; index < word.length; index += 1) {
    const char = word[index];
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    else if (char === ":" && depth === 0) lastColon = index;
  }
  return word
    .slice(lastColon + 1)
    .replace(/^[!-]+/, "")
    .replace(/!$/, "");
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
