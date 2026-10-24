import { openUrl } from "@tauri-apps/plugin-opener";
import { memo, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Code, CodeBlock } from "./CodeBlock.tsx";
import { rehypeCapHighlight, rehypeHiddenCharacters, rehypeUnknownLanguage } from "./codeTree.ts";
import { keepHttps, lureHost } from "./links.ts";
import { textOf, type TreeNode } from "./tree.ts";

/**
 * An answer's text, drawn as Pi draws its Markdown (D16): each element in
 * Pi's role from its getMarkdownTheme(), carried as tokens (D15), at the one
 * reading size, so headings differ by color, weight and the air above them.
 *
 * The text is a model's, so it is input: raw HTML is shown as text (the
 * react-markdown default, kept: no rehype-raw), only https links keep a
 * target, an image is its alt text, and code is highlighted under a size cap.
 * The posture rests on react-markdown's defaults, which is why the stack is
 * pinned and a bump of it is reviewed as a security change.
 *
 * Memoized by its text: while one answer streams, the finished ones above it
 * are not parsed again.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} urlTransform={keepHttps} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

const REMARK: Options["remarkPlugins"] = [remarkGfm];

// Pi's highlighting never guesses a language: auto-detection colors prose.
const REHYPE: Options["rehypePlugins"] = [
  rehypeCapHighlight,
  [rehypeHighlight, { detect: false }],
  rehypeUnknownLanguage,
  rehypeHiddenCharacters,
];

/**
 * Air, which is not a Pi role: one line between blocks (the gap), a line and
 * a half above the two top heading levels, so a section reads as one. Pi
 * underlines the first level, and so does this; it prints `### ` before the
 * third and deeper, which this does not: no Markdown syntax shows as text
 * (D16).
 */
const SECTION_HEADING = "mt-3 text-body font-bold text-heading first:mt-0";
const HEADING = "text-body font-bold text-heading";

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className={`${SECTION_HEADING} underline`}>{children}</h1>,
  h2: ({ children }) => <h2 className={SECTION_HEADING}>{children}</h2>,
  h3: ({ children }) => <h3 className={HEADING}>{children}</h3>,
  h4: ({ children }) => <h4 className={HEADING}>{children}</h4>,
  h5: ({ children }) => <h5 className={HEADING}>{children}</h5>,
  h6: ({ children }) => <h6 className={HEADING}>{children}</h6>,
  // Pi keeps a soft line break as a new line, where HTML would join the lines.
  // Only paragraphs: their content is inline, so no newline between blocks
  // can become a blank line.
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  // Pi's bullet is "- ", for every level and before a task's box too.
  ul: ({ children }) => <ul className="list-['-_'] pl-6 marker:text-list-marker">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="list-decimal pl-6 marker:text-list-marker">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="space-y-2">{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through">{children}</del>,
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-6 border-l-2 border-muted pl-4 text-muted italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-hairline" />,
  table: ({ children }) => <table className="w-full">{children}</table>,
  th: ({ children, style }) => (
    <th style={style} className="border border-hairline px-2 py-1 text-left align-top font-bold wrap-anywhere">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-hairline px-2 py-1 align-top wrap-anywhere">
      {children}
    </td>
  ),
  pre: ({ node, children }) => <CodeBlock node={node as TreeNode | undefined}>{children}</CodeBlock>,
  code: ({ className, children }) => <Code className={className}>{children}</Code>,
  a: ({ href, children, node }) => (
    <Link href={href} text={node ? textOf(node as TreeNode) : ""}>
      {children}
    </Link>
  ),
  // An image would fetch from wherever the model pointed, or draw whatever a
  // data: URL holds; its alt text says what it was.
  img: ({ alt }) => <span className="text-muted">[{alt || "image"}]</span>,
};

/**
 * A link that opens in the system browser, never in the window. A link the
 * app may not open (anything but https) has no target, and is its text.
 */
function Link({ href, text, children }: { href?: string | undefined; text: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>;
  const target = href;
  const lure = lureHost(text, target);

  function open(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    openUrl(target).catch((error: unknown) => {
      toast.error(`The link could not be opened: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  return (
    <>
      <a
        href={target}
        title={target}
        className="text-link underline"
        onClick={open}
        onAuxClick={(event) => {
          if (event.button === 1) open(event);
        }}
      >
        {children}
      </a>
      {lure ? <span className="text-muted"> ({lure})</span> : null}
    </>
  );
}
