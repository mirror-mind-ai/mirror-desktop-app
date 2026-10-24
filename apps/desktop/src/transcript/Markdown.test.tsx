import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { ipcInvocations, scriptIpc } from "../testing/ipcDoor.ts";
import { appStylesheet, declaredValue, rulesOf } from "../testing/stylesheet.ts";
import { assistantTextOf, loadTurn } from "../testing/turns.ts";
import { Markdown } from "./Markdown.tsx";

const markdown = assistantTextOf(loadTurn("markdown-answer"));
const unsafe = assistantTextOf(loadTurn("unsafe-answer"));
const rules = rulesOf(appStylesheet());

/** The fence's content, as the answer wrote it: what Copy must put on the clipboard. */
function fenceOf(language: string): string {
  const fence = new RegExp("```" + language + "\\n([\\s\\S]*?)\\n```").exec(markdown)?.[1];
  if (fence === undefined) throw new Error(`The fixture has no ${language} fence.`);
  return fence;
}

/** The code block whose text includes `text`: its `pre` and the block around it, with its Copy button. */
function codeBlockWith(text: string): { pre: HTMLElement; block: HTMLElement; code: HTMLElement } {
  const pre = screen.getByText(text, { exact: false, selector: "pre *" }).closest("pre");
  const block = pre?.parentElement;
  const code = pre?.querySelector("code");
  if (!pre || !block || !code) throw new Error(`No code block holds ${text}.`);
  return { pre, block, code };
}

describe("an answer's Markdown", () => {
  it("draws each element in Pi's role, and shows no Markdown syntax as text", () => {
    const { container } = render(<Markdown text={markdown} />);

    // Pi underlines the first level only, so H1 and H2 tell apart as in Pi.
    const title = screen.getByRole("heading", { level: 1, name: "Tides" });
    expect(title.className).toContain("text-heading");
    expect(title.className).toContain("underline");
    const section = screen.getByRole("heading", { level: 2, name: "Steps" });
    expect(section.className).toContain("text-heading");
    expect(section.className).not.toContain("underline");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("aside").tagName).toBe("EM");
    expect(screen.getByText("Gone").tagName).toBe("DEL");

    const inline = screen.getByText("inline code");
    expect(inline.tagName).toBe("CODE");
    expect(inline.className).toContain("text-code");

    const almanac = screen.getByRole("link", { name: "the almanac" });
    expect(almanac.getAttribute("href")).toBe("https://example.test/almanac");
    expect(almanac.getAttribute("title")).toBe("https://example.test/almanac");
    expect(almanac.className).toContain("text-link");

    // Pi's bullet is "- ", nested lists included, in its list-marker violet.
    const [bullets, numbers] = screen.getAllByRole("list").filter((list) => list.parentElement?.tagName !== "LI");
    expect(bullets?.className).toContain("marker:text-list-marker");
    const unordered = screen.getAllByRole("list").filter((list) => list.tagName === "UL");
    expect(unordered).toHaveLength(2);
    for (const list of unordered) expect(list.className).toContain("list-['-_']");
    expect(within(bullets as HTMLElement).getAllByRole("listitem").map((item) => item.firstChild?.textContent?.trim())).toEqual([
      "first",
      "second",
      "nested",
    ]);
    expect(numbers?.tagName).toBe("OL");
    expect(numbers?.className).toContain("marker:text-list-marker");

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Tide", "Hour"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["high", "06:12", "low", "12:24"]);

    const quote = screen.getByText("Quoted shore.").closest("blockquote");
    expect(quote?.className).toContain("text-muted");
    expect(quote?.className).toContain("italic");
    expect(screen.getByRole("separator")).toBeTruthy();

    const prose = [...container.querySelectorAll("h1, h2, h3, p, li, th, td, blockquote")].map((element) => element.textContent).join("\n");
    expect(prose).not.toMatch(/\*\*|`|~~|^#|\]\(/m);
  });

  // Pi draws a paragraph's soft line break as a new line; HTML would join the lines.
  it("keeps a paragraph's line breaks, as Pi does", () => {
    const verse = assistantTextOf(loadTurn("streamed-answer"));
    expect(verse).toContain("\n");
    render(<Markdown text={verse} />);
    const paragraph = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === verse);
    expect(paragraph.className).toContain("whitespace-pre-line");
  });

  it("colors every token of a language highlight.js knows by a rule app.css defines, as Pi draws it", () => {
    render(<Markdown text={markdown} />);
    const { code } = codeBlockWith("tides turn twice a day");
    expect(code.className).toContain("hljs");
    expect(code.className).toContain("text-ink");

    const color = (text: string) => declaredValue(within(code).getByText(text), rules, "color");
    // What Pi's own highlightCode draws for the same tokens (highlight.js 10):
    // a class name in the function color, `this` and the built-in types in the
    // type color. Pi does not color a property; it stays in the block's ink.
    expect({
      comment: color("// tides turn twice a day"),
      keyword: color("class"),
      "class name": color("Tide"),
      "inherited class name": color("Wave"),
      "method name": color("rise"),
      "function name": color("ebb"),
      attribute: color("height"),
      parameter: color("level"),
      "built-in type": color("number"),
      this: color("this"),
      string: color('"high"'),
      number: color("42"),
      literal: color("true"),
      property: color("name"),
    }).toEqual({
      comment: "var(--color-muted)",
      keyword: "var(--color-syntax-keyword)",
      "class name": "var(--color-syntax-function)",
      "inherited class name": "var(--color-syntax-function)",
      "method name": "var(--color-syntax-function)",
      "function name": "var(--color-syntax-function)",
      attribute: "var(--color-syntax-variable)",
      parameter: "var(--color-syntax-variable)",
      "built-in type": "var(--color-syntax-type)",
      this: "var(--color-syntax-type)",
      string: "var(--color-syntax-string)",
      number: "var(--color-syntax-number)",
      literal: "var(--color-syntax-number)",
      property: undefined,
    });
  });

  it("draws a block with no language, or one highlight.js does not know, in Pi's code-block color", () => {
    render(<Markdown text={markdown} />);
    for (const text of ["plain words", "lanterns = 3"]) {
      const { code } = codeBlockWith(text);
      expect(code.className, text).toContain("text-code-block");
      expect(code.className, text).not.toContain("hljs");
      expect(code.querySelector("span"), text).toBeNull();
    }
    // `text` is a language highlight.js knows, with nothing to color: Pi draws it in ink.
    expect(codeBlockWith("listed as text").code.className).toContain("text-ink");
  });

  it("does not highlight a block over 32 KB, and draws it in the code-block color", () => {
    const huge = "```ts\n" + "const tide = 1;\n".repeat(2100) + "```";
    expect(huge.length).toBeGreaterThan(32 * 1024);
    render(<Markdown text={huge} />);
    const { code } = codeBlockWith("const tide = 1;");
    expect(code.className).toContain("text-code-block");
    expect(code.querySelector("span")).toBeNull();
  });

  it("wraps a code block's long lines", () => {
    render(<Markdown text={markdown} />);
    expect(codeBlockWith("long enough to run past").pre.className).toContain("whitespace-pre-wrap");
  });

  it("shows a hidden character in a code block as a marker naming it", () => {
    render(<Markdown text={markdown} />);
    const { code } = codeBlockWith("long enough to run past");
    const marker = within(code).getByTitle("U+202E RIGHT-TO-LEFT OVERRIDE");
    expect(marker.textContent).toBe("U+202E");
    expect(code.textContent).not.toContain("\u202e");
  });
});

describe("a code block's Copy", () => {
  it("puts the fence's exact content on the clipboard, hidden characters included, and says so", async () => {
    const user = userEvent.setup();
    render(<Markdown text={markdown} />);
    const { block } = codeBlockWith("long enough to run past");

    await user.click(within(block).getByRole("button", { name: "Copy code" }));

    expect(await navigator.clipboard.readText()).toBe(fenceOf("bash"));
    expect(fenceOf("bash")).toContain("\u202e");
    expect(await within(block).findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("says so when the clipboard refuses", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <Markdown text={markdown} />
      </>,
    );
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Write permission denied."));

    await user.click(within(codeBlockWith("plain words").block).getByRole("button", { name: "Copy code" }));

    expect(await screen.findByText("The code could not be copied.")).toBeTruthy();
    expect(within(codeBlockWith("plain words").block).queryByRole("button", { name: "Copied" })).toBeNull();
  });
});

describe("a link in an answer", () => {
  it("opens in the system browser on a click and on a middle click, and never navigates the window", async () => {
    scriptIpc("plugin:opener|open_url", () => undefined);
    render(<Markdown text={markdown} />);
    const almanac = screen.getByRole("link", { name: "the almanac" });

    expect(fireEvent.click(almanac), "the click was not prevented").toBe(false);
    expect(fireEvent(almanac, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 })), "the middle click was not prevented").toBe(false);

    await waitFor(() =>
      expect(ipcInvocations()).toEqual([
        { command: "plugin:opener|open_url", args: { url: "https://example.test/almanac" } },
        { command: "plugin:opener|open_url", args: { url: "https://example.test/almanac" } },
      ]),
    );
  });

  it("says so when the opener refuses", async () => {
    scriptIpc("plugin:opener|open_url", () => {
      throw new Error("Not allowed to open this URL.");
    });
    render(
      <>
        <Toaster />
        <Markdown text={markdown} />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "the almanac" }));

    expect(await screen.findByText("The link could not be opened: Not allowed to open this URL.")).toBeTruthy();
  });
});

describe("an answer that reaches past Markdown", () => {
  it("shows raw HTML as text, never as elements", () => {
    const { container } = render(<Markdown text={unsafe} />);
    expect(screen.getByText("Raw <img src=x onerror=alert(1)> inline.")).toBeTruthy();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(container.querySelector("script, img, iframe")).toBeNull();
  });

  it("keeps a target only for an https link, and never opens a new window", () => {
    const { container } = render(<Markdown text={unsafe} />);
    for (const name of ["run", "page", "plain", "mail", "www.example.test"]) {
      expect(screen.queryByRole("link", { name }), name).toBeNull();
      expect(screen.getByText(name), name).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "safe" }).getAttribute("href")).toBe("https://example.test/b");
    expect(container.querySelectorAll("[href]")).toHaveLength(2);
    expect(container.querySelector("[target]")).toBeNull();
  });

  it("shows an image as its alt text, and fetches nothing", () => {
    const { container } = render(<Markdown text={unsafe} />);
    expect(screen.getByText("[a chart]")).toBeTruthy();
    expect(screen.getByText("[image]")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(document.querySelector("link")).toBeNull();
  });

  it("names the target's host after a link whose text is a URL to somewhere else", () => {
    render(<Markdown text={unsafe} />);
    const lure = screen.getByRole("link", { name: "example.test/docs" });
    expect(lure.getAttribute("href")).toBe("https://elsewhere.test/x");
    expect(lure.nextElementSibling?.textContent).toBe(" (elsewhere.test)");
    expect(lure.nextElementSibling?.className).toContain("text-muted");
    // A link whose text is not a URL keeps its target to the title, as Pi in iTerm.
    expect(screen.getByRole("link", { name: "safe" }).nextElementSibling).toBeNull();
  });
});
