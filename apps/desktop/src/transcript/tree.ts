// The syntax tree an answer's Markdown becomes (hast), typed by the little
// the transcript reads and writes, so the app does not import a syntax-tree
// package of its own. The passes around highlighting (codeTree.ts) and the
// components react-markdown hands a node (Markdown.tsx) share it.

/** The parts of a hast node the transcript reads and writes. */
export interface TreeNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
}

/** The text a node holds, as the tree has it. */
export function textOf(node: TreeNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}
