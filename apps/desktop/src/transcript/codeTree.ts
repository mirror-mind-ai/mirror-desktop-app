// Code in an answer's syntax tree (hast), around rehype-highlight.
//
// Three passes, each a rehype plugin, plus the copy text:
//
// - Before highlighting, a block over 32 KB is marked `no-highlight`, which
//   rehype-highlight honors. Highlighting runs on every delta while an answer
//   streams, on the main thread, over text a model wrote; a cap keeps a huge
//   or hostile block from freezing the window. The block falls back to Pi's
//   code-block color, as a language Pi does not know does.
// - After it, a block whose language highlight.js does not know loses the
//   `hljs` class: rehype-highlight adds the class before it tries the
//   language, and reports the unknown one as a message naming the node.
//   Without the class the block is drawn in the code-block color, as Pi draws
//   it; a known language with nothing to color (`text`) keeps it, and is ink.
// - Then every hidden character in code (bidi controls, zero-width
//   characters) becomes a visible marker naming it, so a block cannot show
//   one command and hold another. Copy still copies the character itself:
//   `sourceText` reads it back from the marker.
//
// The tree's type and its text are tree.ts's, shared with Markdown.tsx.

import { textOf, type TreeNode } from "./tree.ts";

interface FileMessages {
  readonly messages: readonly {
    readonly source?: string | null | undefined;
    readonly ruleId?: string | null | undefined;
    readonly ancestors?: readonly unknown[] | null | undefined;
  }[];
}

/** Above this many characters a block is not highlighted. */
const HIGHLIGHT_LIMIT = 32 * 1024;

/** Bidi controls and zero-width characters: what can make code read one way and run another. */
const HIDDEN = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const EVERY_HIDDEN = new RegExp(HIDDEN.source, "g");

const HIDDEN_NAMES: Readonly<Record<string, string>> = {
  "200B": "ZERO WIDTH SPACE",
  "200C": "ZERO WIDTH NON-JOINER",
  "200D": "ZERO WIDTH JOINER",
  "200E": "LEFT-TO-RIGHT MARK",
  "200F": "RIGHT-TO-LEFT MARK",
  "202A": "LEFT-TO-RIGHT EMBEDDING",
  "202B": "RIGHT-TO-LEFT EMBEDDING",
  "202C": "POP DIRECTIONAL FORMATTING",
  "202D": "LEFT-TO-RIGHT OVERRIDE",
  "202E": "RIGHT-TO-LEFT OVERRIDE",
  "2066": "LEFT-TO-RIGHT ISOLATE",
  "2067": "RIGHT-TO-LEFT ISOLATE",
  "2068": "FIRST STRONG ISOLATE",
  "2069": "POP DIRECTIONAL ISOLATE",
  FEFF: "ZERO WIDTH NO-BREAK SPACE",
};

/** Before rehype-highlight: leave a block over the limit unhighlighted. */
export function rehypeCapHighlight() {
  return (tree: TreeNode): void => {
    forEachBlock(tree, (code) => {
      if (textOf(code).length > HIGHLIGHT_LIMIT) classesOf(code).push("no-highlight");
    });
  };
}

/** After rehype-highlight: a block whose language it does not know is not highlighted. */
export function rehypeUnknownLanguage() {
  return (tree: TreeNode, file: FileMessages): void => {
    const unknown = new Set(
      file.messages
        .filter((message) => message.source === "rehype-highlight" && message.ruleId === "missing-language")
        .map((message) => message.ancestors?.at(-1)),
    );
    if (unknown.size === 0) return;
    forEachBlock(tree, (code) => {
      if (unknown.has(code)) code.properties = { ...code.properties, className: classesOf(code).filter((name) => name !== "hljs") };
    });
  };
}

/** After highlighting: every hidden character in code becomes a marker naming it. */
export function rehypeHiddenCharacters() {
  return (tree: TreeNode): void => {
    visit(tree, (node) => {
      if (node.tagName === "code") markHidden(node);
    });
  };
}

/** The text a code node holds, hidden characters included, as the answer wrote it. */
export function sourceText(node: TreeNode): string {
  if (node.type === "text") return node.value ?? "";
  const hidden = node.properties?.["dataHiddenCharacter"];
  if (typeof hidden === "string") return String.fromCodePoint(Number.parseInt(hidden, 16));
  return (node.children ?? []).map(sourceText).join("");
}

function markHidden(node: TreeNode): void {
  node.children = (node.children ?? []).flatMap((child) => {
    if (child.type !== "text") {
      markHidden(child);
      return [child];
    }
    const value = child.value ?? "";
    if (!HIDDEN.test(value)) return [child];
    const pieces: TreeNode[] = [];
    let from = 0;
    for (const match of value.matchAll(EVERY_HIDDEN)) {
      if (match.index > from) pieces.push({ type: "text", value: value.slice(from, match.index) });
      pieces.push(marker(match[0]));
      from = match.index + match[0].length;
    }
    if (from < value.length) pieces.push({ type: "text", value: value.slice(from) });
    return pieces;
  });
}

function marker(char: string): TreeNode {
  const code = (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return {
    type: "element",
    tagName: "span",
    properties: {
      dataHiddenCharacter: code,
      title: `U+${code} ${HIDDEN_NAMES[code] ?? "HIDDEN CHARACTER"}`,
      className: ["rounded-control", "border", "border-notice", "px-0.5", "text-meta", "text-notice"],
    },
    children: [{ type: "text", value: `U+${code}` }],
  };
}

/** Each code block: a `code` element inside a `pre`. */
function forEachBlock(tree: TreeNode, act: (code: TreeNode) => void): void {
  visit(tree, (node) => {
    if (node.tagName !== "pre") return;
    for (const child of node.children ?? []) if (child.tagName === "code") act(child);
  });
}

function visit(node: TreeNode, act: (node: TreeNode) => void): void {
  act(node);
  for (const child of node.children ?? []) visit(child, act);
}

function classesOf(node: TreeNode): string[] {
  const current = node.properties?.["className"];
  const classes = Array.isArray(current) ? current.filter((name): name is string => typeof name === "string") : [];
  node.properties = { ...node.properties, className: classes };
  return classes;
}
