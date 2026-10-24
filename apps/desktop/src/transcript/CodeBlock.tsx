import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { sourceText } from "./codeTree.ts";
import type { TreeNode } from "./tree.ts";

/** How long the Copy button says "Copied". */
const COPIED_FOR_MS = 1500;

/** Whether a `code` element sits in a block: react-markdown draws inline and block code with the same component. */
const InCodeBlock = createContext(false);

/**
 * A fenced code block, drawn as Pi draws one: Monaco on the raised ground
 * inside a hairline, long lines wrapped as the terminal wraps them, and a Copy
 * button that appears on hover or focus. Copy puts the fence's content on the
 * clipboard exactly as the answer wrote it, read from the syntax tree rather
 * than the page, so the hidden-character markers stay out and the characters
 * they mark stay in.
 */
export function CodeBlock({ node, children }: { node?: TreeNode | undefined; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(node ? sourceText(node).replace(/\n$/, "") : "");
    } catch {
      toast.error("The code could not be copied.");
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <div className="group relative">
      <pre className="rounded-control border border-hairline bg-raised px-3 py-2 font-mono text-body whitespace-pre-wrap wrap-anywhere">
        <InCodeBlock.Provider value={true}>{children}</InCodeBlock.Provider>
      </pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={() => void copy()}
        className="absolute top-1.5 right-1.5 rounded-control border border-hairline bg-raised px-2 py-0.5 text-meta text-muted opacity-0 outline-none group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Code, inline or in a block. Inline, it is Pi's inline-code violet. In a
 * block, it is highlighted when highlight.js knew its language (the `hljs`
 * class, whose spans app.css colors with Pi's mapping) and is otherwise all
 * in Pi's code-block color, as Pi draws a block it cannot highlight.
 */
export function Code({ className, children }: { className?: string | undefined; children?: ReactNode }) {
  const inBlock = useContext(InCodeBlock);
  if (!inBlock) return <code className="text-code">{children}</code>;
  const highlighted = className?.split(" ").includes("hljs") ?? false;
  return <code className={`${className ?? ""} ${highlighted ? "text-ink" : "text-code-block"}`.trim()}>{children}</code>;
}
