[< Parent](../index.md)

# CV1.DS1.US2 — Transcript rendering

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a person reading Pi's answers in the app,
I want the transcript to render everything a turn produces the way Pi draws it — prose as Markdown in Pi's colors, code highlighted and copyable, tables, each tool call folded into one line that opens on its arguments and result, thinking muted and folded, retries and provider errors named — and the view to follow the stream only while I am at the bottom,
So that I read an answer here as comfortably as in Pi, and can scroll back while it keeps streaming without losing my place.

## Outcome

An assistant answer reads as Pi draws it: headings, inline code, list
markers, links and fenced code in Pi's own colors, carried from its theme
files the way TS2 carried the chrome (D15), with the styles Pi's renderer
adds (a first-level heading underlined, a quote in italic, a bullet drawn
`- `); bold, italic and strikethrough as styles; tables with hairlines;
quotes and rules muted; a paragraph's line breaks kept; no Markdown syntax
shown as text, Pi's `### ` before deeper headings included (D16), no raw HTML ever rendered, an image as its alt text, and only
`https` links kept, since those are the ones the app may open. A fenced block
with a language is highlighted through Pi's own token-to-role mapping on
highlight.js, the engine Pi uses; a block with no or an unknown language is
Pi's code-block green, as in Pi; long lines wrap, hidden characters show;
every block has a Copy button, and the transcript's text can be selected. A
link opens in the system browser and never navigates the window. A tool
call is Pi's folded form — status, name, a preview of its arguments, its
duration, then up to ten lines of its result — on Pi's tool ground (pending,
success, error), and opens on its arguments in full and the whole result.
Thinking streams muted and italic in Pi's thinking color, then folds, while
the view is following, to a line that reopens on click. A retry, a
provider error and an extension failure are notices with a name and a tone;
a stopped message is not called a provider's error, and what a stop leaves
is CV1.DS2's.
The view follows the stream while the person is at the bottom; scrolling up
holds the view, and a "Jump to latest" button brings it back and resumes
following. Every rendering path has a UI test against the fake host, from
invented fixtures.

## Acceptance Behavior

```text
Given an assistant answer with a heading, inline code, a list, a link, bold text and a fenced block with no language
When it renders in the dark theme
Then the heading is #cd9a22, the inline code and the list markers #a798d7, the link #69add0, the bold text bold and the block #68b78d, as Pi draws them
And no Markdown syntax, such as ** or a backtick, is shown as text

Given a fenced block whose language highlight.js knows
When it renders
Then its keywords, strings, numbers, comments and the rest take Pi's syntax roles through Pi's own mapping, and a block with no or an unknown language takes the code-block color
And long lines wrap, and a hidden character shows as a marker
And a Copy button on the block puts the block's exact text, and nothing else, on the clipboard and says so for a moment

Given an answer with a table
When it renders
Then it is a table, its header row bold, its cells separated by hairlines and wrapping within the measure

Given an answer that contains raw HTML, an image, or a link whose scheme is not https
When it renders
Then the HTML is shown as text, never as elements, the image as its alt text, and the link without its target

Given an https link in an answer
When the person clicks it
Then it opens in the system browser and the window stays on the conversation
And when the link's text is itself a URL with a different host, the target's host is shown muted after it

Given a turn in which Pi runs a tool
When the tool starts
Then the transcript shows one line with a working mark, the tool's name and a preview of its arguments, on the pending ground
And when it ends, the line shows success or error, on that ground, with the duration as Pi formats it, and up to ten lines of the result beneath it
And opening the row shows every argument in full and the whole result, muted; closing it folds the row again

Given a turn in which the model thinks before answering, with the view following
When the thinking streams
Then it shows muted and italic in Pi's thinking color, open
And once the answer's text begins, it folds to one line that opens again on click
And with the view held, it stays open until the person folds it or following resumes

Given a provider that asks for a retry, one that fails the turn, and an extension that fails inside Pi
When each happens
Then the transcript shows a notice named for it — "Retry 1 of 3", "Provider error", "Extension failed" — with the message, the retry and the extension in the notice color and the provider error in the danger color

Given a streaming answer and the view at the bottom
When new text arrives
Then the view follows it

Given a streaming answer and the person has scrolled up to read
When new text arrives
Then the view holds where they are and a "Jump to latest" button is offered
And activating it returns the view to the latest text and the view follows again
```

## Navigator Request

**Captured:** 2026-10-24, at the [CV1.DS1.TS2](../cv1-ds1-ts2-mirrors-tokens-and-theme/index.md) checkpoint, by the Navigator's ruling to keep Markdown in this story.

The transcript carries Pi's colors along the text, as Pi draws its own
Markdown (D15). Reading the TS2 transcript beside Pi, the Navigator found
the face right and the text monochrome: the transcript printed Markdown as
source (`**` and backticks shown), so nothing could carry a color. The roles,
read from Pi's `getMarkdownTheme()` and its theme files:

| Markdown | Pi role | Dark | Light |
|---|---|---|---|
| heading | `mdHeading` | `#cd9a22` | `#8f6802` |
| inline code | `mdCode` | `#a798d7` | `#7459b4` |
| list marker | `mdListBullet` | `#a798d7` | `#7459b4` |
| link, and its URL | `mdLink`, `mdLinkUrl` | `#69add0`, muted | `#2f7899`, muted |
| code block with no language | `mdCodeBlock` | `#68b78d` | `#337e58` |
| quote, its border, a rule | `mdQuote`, `mdQuoteBorder`, `mdHr` | muted | muted |
| bold, italic, strikethrough | styles, not colors | | |

Code with a language takes Pi's `syntax*` roles from the same files. Each
role enters `app.css` as a token, carried and tagged as TS2's tokens are.

```text
Given an assistant answer with a heading, inline code, a list, a link, bold text and a fenced block with no language
When it renders in the dark theme
Then the heading is #cd9a22, the inline code and the list markers #a798d7, the link #69add0, the bold text bold and the block #68b78d, as Pi draws them
And no Markdown syntax, such as ** or a backtick, is shown as text
```

## Scope

- Pi's transcript roles as tokens in both themes: Markdown, syntax, thinking
  and the tool grounds, carried from Pi's theme files with Pi's converter and
  tagged as TS2's are (D15).
- Assistant prose as Markdown: headings, paragraphs, lists, inline code,
  links, emphasis, quotes, rules, tables and fenced code, on
  `react-markdown` with GFM, pinned; raw HTML never rendered; images as
  text; only `https` links kept, opened in the system browser.
- Fenced code highlighted on highlight.js through Pi's token-to-role
  mapping, carried into highlight.js 11's classes; a block with no or an
  unknown language in Pi's code-block color; lines wrapped; hidden
  characters shown; a Copy button per block; the transcript's text
  selectable.
- Tool rows: the transcript model keeps the arguments and the result; Pi's
  folded form per call on Pi's tool ground, opening on the arguments and
  the whole result.
- Thinking: kept in the assistant row, shown muted and italic in Pi's
  thinking color, open while it streams, folded once the text begins while
  the view follows, toggled by click.
- Notices with a name and a tone: retry, provider error, extension failure.
- Following the stream: the view follows while at the bottom, holds when the
  person scrolls up, and offers "Jump to latest".
- Fixtures for each path, invented and inert, and a UI test for each
  against the fake host, which learns to play an extension failure; the
  transcript reducer's tests extended.

## Out Of Scope

- The composer (US3); what Stop does to a turn, and the "stopped" mark it
  may leave (CV1.DS2).
- Diffs in Pi's `toolDiff*` colors: the protocol carries a tool's text
  result and no diff; carrying the edit tool's diff is a protocol change for
  a later story, and `toolDiff*` is carried then.
- Tool-specific renderers (Pi's read, edit and bash renderers), images in
  tool results, Pi's `queue_update` (steering and follow-up queues),
  `thinking*` level colors, `bashMode`, `customMessage*`.
- A setting to hide thinking; Markdown in the person's own rows (their text
  stays as typed); LaTeX; Mermaid; link previews; search; export.
- A size scale for headings: Pi has none, and the stylesheet keeps one
  reading size; headings differ by color, weight and the air above them.
- Host, protocol and Rust changes; new permissions, so no `http`, `mailto`
  or `tel` links.
- The Rust-side webview navigation guard, the layered defense behind the
  prevented click: a ledger entry at this story's Debt Review.

## Validation

The gate; the transcript's unit and UI tests over the new fixtures; the real
app on a Journey the Navigator names, reading an answer with every Markdown
element and a turn with tool use beside Pi in iTerm (dark) and on its own in
light, scrolling up during a long stream, copying a block, and opening a
link. The route, with its expected observations, is in the
[test guide](test-guide.md); the plan in [plan.md](plan.md); the review
behind it in [plan-review.md](plan-review.md).
