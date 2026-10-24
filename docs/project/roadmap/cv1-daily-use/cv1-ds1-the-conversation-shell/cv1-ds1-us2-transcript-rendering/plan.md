[< Story](index.md)

# Plan — CV1.DS1.US2

## Objective

Make the transcript read as Pi draws it. TS2 gave the window Pi's face and
ground, and at its checkpoint the Navigator read the text and found it
monochrome: the transcript printed Markdown as source, so no color could
land on a heading, a code span or a link. The rest of what a turn produces
is in the same state, or worse: a tool call is a 160-character slice of JSON
with no result; thinking is dropped at the reducer; a retry is a line of
text; a provider error is a red paragraph with no name; and the view jumps
to the bottom on every delta, so reading back during a stream is not
possible.

This story renders each of those as Pi does, in Pi's colors, carried from
the same two theme files TS2 carried the chrome from (D15), and gives the
view the one behavior a stream needs: follow while the person is at the
bottom, hold when they scroll up, offer a way back.

Read from the code, not guessed:

- **The protocol already carries everything.** `text_delta`,
  `thinking_delta`, `tool_start` with its `args`, `tool_end` with its
  `resultText`, `isError` and `durationMs`, `retry` with attempt, maximum
  and delay, `message_end` with `errorMessage`, and
  `session.extension_error`. No host, protocol or Rust change is needed.
  What is missing is on the UI side: the reducer keeps too little, and the
  row draws too plainly.
- **Pi's roles are a short list.** `getMarkdownTheme()` names them:
  `mdHeading` (yellow), `mdCode` and `mdListBullet` (violet), `mdLink`
  (blue) and `mdLinkUrl` (muted), `mdCodeBlock` (green), `mdQuote`,
  `mdQuoteBorder`, `mdHr` and `mdCodeBlockBorder` (muted); bold, italic,
  strikethrough as styles. Code with a language goes through Pi's
  `buildCliHighlightTheme`, one function that maps highlight.js token
  classes to `syntax*` roles. Thinking is `thinkingText`, italic. A tool
  sits on `toolPendingBg`, `toolSuccessBg` or `toolErrorBg`, its title in
  `text`, its output in `muted`, collapsed to a preview of `key=value`
  pairs within 100 characters and ten lines of output.
- **Pi highlights with highlight.js 10.7**, and skips highlighting when
  the fence names no language it knows, because auto-detection colors
  prose. The web engine for the same grammars (`lowlight`) runs
  **highlight.js 11**, whose classes are scoped (`hljs-title function_`)
  where Pi's keys are flat (`function`, `title`), so the mapping is carried
  by meaning, not transcribed.
- **Pi hides a link's URL in iTerm.** Pi's TUI renders a link as an OSC 8
  hyperlink when the terminal supports it, which iTerm2 does; the
  parenthesized `(url)` is its fallback for terminals without hyperlinks,
  and only when the text differs from the href. A window with a title on
  hover carries that, not departs from it.
- **A link in the webview navigates the window.** The app already opens
  URLs in the system browser through the opener plugin, permitted for
  `https://*` and nothing else; links in the transcript go the same way,
  and only those links.

This is the second version of the plan, revised after a four-lens review
and the Navigator's rulings; see [plan-review.md](plan-review.md).

## Decisions taken

| | Decision | Ruling |
|---|---|---|
| D1 | The Markdown stack | **`react-markdown` 10.1.0, `remark-gfm` 4.0.1, `rehype-highlight` 7.0.2** (bringing `lowlight` 3, highlight.js 11's common grammars, 37 languages), all MIT, **pinned exactly**, the lockfile committed, no install script in the tree. `react-markdown` is the one D11 names; GFM is where tables, strikethrough and task lists live; `rehype-highlight` is highlight.js, Pi's engine. **Sanitization rests on react-markdown's defaults, kept and pinned by tests:** raw HTML in the source is rendered as text, never as elements (no `rehype-raw`); and `urlTransform` is replaced by the story's own, which keeps `https` only (D4). D16 says the posture is default-dependent, so a bump of this stack is reviewed as a security change, not waved through. |
| D2 | The tokens | **One token per role with a hue, in both themes, literal and tagged as TS2's are.** Roles Pi aliases to `muted` (link URL, quote, quote border, rule, code-block border, comment, operator, punctuation, tool output) use `muted`, as Pi does. A hue layer with aliases would be Pi's own structure, but the stylesheet test holds every token to a literal in both blocks, and TS2 chose roles over hues. |
| D3 | Headings | **Pi's heading color and bold, at the body size.** Pi has no size scale, and the stylesheet keeps one reading size. Levels differ by the air above them, which is not a Pi role and is said so (scope 3). |
| D4 | Links | **`https` links only.** A link's text in Pi's link blue, underlined, its URL as the title, as Pi in iTerm. A click opens the system browser through the opener plugin, the opener's refusal is caught and said as a toast, `click` and `auxclick` are both prevented, and no `target` attribute is ever rendered. **Every other scheme — `http`, `mailto`, `tel`, `data:`, `javascript:`, relative paths, fragments, and GFM's autolinked `www.` literals — renders as text with no target**, because the opener's scope is `https://*` and this story adds no permission. **R3:** when a link's visible text is itself a URL whose host differs from the target's, the target's host is shown muted after the text, the one case where a hidden URL is a lure; otherwise the URL stays in the title. |
| D5 | Code blocks | **Highlighted when the fence names a language lowlight knows, through Pi's mapping carried into highlight.js 11's class vocabulary; otherwise the whole block in Pi's code-block green, with no auto-detection, for Pi's reason.** The fallback keys on whether highlight.js knew the language. *Corrected during implementation:* `rehype-highlight` adds the `hljs` class before it tries the language, so a fence named `foo` keeps the class with nothing highlighted; the block loses `hljs` when `rehype-highlight` reports the language missing, so `foo` is green, and `text`, a language highlight.js knows with nothing to color, is ink, as in Pi. A block above 32 KB is not highlighted and falls back to green. The block sits on the raised ground inside the hairline, in the mono face; **R2: long lines wrap**, as the terminal wraps Pi's. Bidi controls (U+202A–U+202E, U+2066–U+2069) and zero-width characters (U+200B–U+200F, U+FEFF) render as a visible marker with a title naming the character, so a block cannot show one command and copy another. A **Copy** button at the block's top right, shown on hover or focus, copies the code node's text — the fence's content, without a trailing newline, hidden characters included — with `navigator.clipboard.writeText`, and reads **Copied** for 1.5 s. The transcript's measure is `select-text`. |
| D6 | Tool rows | **R1: Pi's folded form.** One line — a status mark (the pulse while running, ✓ in `success` or ✗ in `danger` after), the name in bold, the arguments' preview as Pi folds them (`key=JSON(value)` pairs joined by spaces, cut at 100 characters with `...`), the duration as Pi formats it (`4.2s`, `1m 30s`) — then up to ten lines of the result, muted, and "… n more lines" when there are more. The row sits on Pi's tool ground for its state. A button with `aria-expanded` opens the row on every argument in full and the whole result, with no nested scroll: the transcript scrolls. Closing folds it back to Pi's form. |
| D7 | Thinking | **In the assistant row, before its text; muted, italic, in Pi's thinking color; open while it streams; folded to one line — "Thinking…" while it runs, "Thought" when done — once the answer's text begins or the message ends; a click toggles it.** The fold is derived, not initialized: `override: boolean \| null` in the row's state, shown open = `override ?? (text === "" && !done)`, a click sets the override. **The auto-fold applies only while the view is following**: a held view never has content collapse under the eye; the thinking stays open until the person folds it or following resumes. Plain text, not Markdown: a thought is read, not studied, its Markdown would be a second parser on every delta, and plain text is one injected-render surface fewer. |
| D8 | Notices | **A name and a tone.** "Retry 1 of 3" with the provider's message and "retrying in 2s", in the notice color; "Provider error" with the message, in the danger color, as a row after the partial answer rather than a paragraph under it; "Extension failed" with the extension, the event and the message, in the notice color. The name is bold, the text plain, nothing goes through a parser. |
| D9 | Following the stream | **The view follows while it is at the bottom (within 24 px); a scroll event off the bottom holds it; a "Jump to latest" button floats at the transcript's bottom edge while not following; activating it scrolls to the end and resumes following.** The scroll is instant (`behavior: auto`), as today, so the follow flag never reads a view mid-animation. The button sits on the raised ground inside a hairline, legible over any content. A conversation mounts at the bottom; switching Journeys remounts the conversation (the shell keys it), so it opens at the latest. |
| D10 | Where it lives | **`apps/desktop/src/transcript/`**: the transcript's rendering as its own concern (`Transcript.tsx`, `TranscriptRow.tsx`, `Markdown.tsx`, `CodeBlock.tsx`, `ToolRow.tsx`, `Thinking.tsx`, `Notice.tsx`, `format.ts`, `follow.ts`; as built, also `codeTree.ts` for the passes around highlighting, `links.ts` for the link rules and `following.ts` for the flag thinking reads), moved out of `shell/`, which keeps the chrome and `Pulse`, imported across. The reducer stays in `conversations/transcript.ts`: it is the store's, and `transcript/` depends on it one way. |

## Scope

1. **The tokens.** Added to `app.css` in `@theme` and `.light`, each tagged
   carried with Pi's role, computed with Pi's converter from `dark.json` and
   `light.json`:

   | Token | Role | Dark | Light |
   |---|---|---|---|
   | `--color-heading` | a heading | `#cd9a22` carried, Pi dark `mdHeading` (yellow, the warning's value) | `#8f6802` carried, Pi light `mdHeading` |
   | `--color-code` | inline code | `#a798d7` carried, Pi dark `mdCode` (violet, the accent's value) | `#7459b4` carried, Pi light `mdCode` |
   | `--color-list-marker` | a list's bullet or number | `#a798d7` carried, Pi dark `mdListBullet` (violet) | `#7459b4` carried, Pi light `mdListBullet` |
   | `--color-link` | a link's text | `#69add0` carried, Pi dark `mdLink` (blue) | `#2f7899` carried, Pi light `mdLink` |
   | `--color-code-block` | a block with no highlighting | `#68b78d` carried, Pi dark `mdCodeBlock` (green, the success's value) | `#337e58` carried, Pi light `mdCodeBlock` |
   | `--color-thinking` | thinking | `#96a0a4` carried, Pi dark `thinkingText` | `#7c868c` carried, Pi light `thinkingText` |
   | `--color-tool-pending` | a running tool's ground | `#34383a` carried, Pi dark `toolPendingBg` | `#e4e5e6` carried, Pi light `toolPendingBg` |
   | `--color-tool-success` | a succeeded tool's ground | `#254131` carried, Pi dark `toolSuccessBg` | `#dee9e1` carried, Pi light `toolSuccessBg` |
   | `--color-tool-error` | a failed tool's ground | `#5b282a` carried, Pi dark `toolErrorBg` | `#eee2e1` carried, Pi light `toolErrorBg` |
   | `--color-syntax-keyword` | keyword, tag name | `#69add0` carried, Pi dark `syntaxKeyword` (blue) | `#2f7899` carried, Pi light `syntaxKeyword` |
   | `--color-syntax-function` | function, title | `#cd9a22` carried, Pi dark `syntaxFunction` (yellow) | `#8f6802` carried, Pi light `syntaxFunction` |
   | `--color-syntax-variable` | variable, attribute, parameter | `#5db3ba` carried, Pi dark `syntaxVariable` | `#287a81` carried, Pi light `syntaxVariable` |
   | `--color-syntax-string` | string, regexp | `#de8d5a` carried, Pi dark `syntaxString` | `#a45417` carried, Pi light `syntaxString` |
   | `--color-syntax-number` | number, literal | `#68b78d` carried, Pi dark `syntaxNumber` (green) | `#337e58` carried, Pi light `syntaxNumber` |
   | `--color-syntax-type` | type, class, built-in | `#a798d7` carried, Pi dark `syntaxType` (violet) | `#7459b4` carried, Pi light `syntaxType` |

   The ✓ and ✗ marks use `success` and `danger`, both already in both
   themes; the pulse stays muted. Comment, doctag, operator, punctuation,
   meta and tag take `muted`, as Pi maps them; `addition` and `deletion` in
   a highlighted diff block take `success` and `danger` (Pi's
   `toolDiffAdded` and `toolDiffRemoved`, the same values).

   **The highlight mapping** is one block in `app.css`, written in
   highlight.js 11's class vocabulary and carried by meaning from Pi's
   `buildCliHighlightTheme` (highlight.js 10.7, flat keys), tagged with
   both sources so it can be read beside Pi's:

   | highlight.js 11 class | Pi key | Token |
   |---|---|---|
   | `.hljs-keyword`, `.hljs-name` | `keyword`, `name` | `syntax-keyword` |
   | `.hljs-title`, whether `function_`, `class_` or bare | `title`; a class name is a `title` inside a `class` in 10 | `syntax-function` |
   | `.hljs-type`, `.hljs-built_in`, `.hljs-variable.language_` | `type`, `built_in`; `this` is a `built_in` in 10 | `syntax-type` |
   | `.hljs-variable`, `.hljs-attr`, `.hljs-params` | `variable`, `attr`, `params` | `syntax-variable` |
   | `.hljs-string`, `.hljs-regexp` | `string`, `regexp` | `syntax-string` |
   | `.hljs-number`, `.hljs-literal` | `number`, `literal` | `syntax-number` |
   | `.hljs-comment`, `.hljs-doctag`, `.hljs-meta`, `.hljs-operator`, `.hljs-punctuation`, `.hljs-tag` | the same, `tag` → punctuation | `muted` |
   | `.hljs-subst` | `subst` | `ink` |
   | `.hljs-emphasis`, `.hljs-strong`, `.hljs-link` | styles | italic, bold, underline |
   | `.hljs-addition`, `.hljs-deletion` | `addition`, `deletion` | `success`, `danger` |

   A class is colored by its first name, with Pi's key of that name; where
   10 and 11 name the same token differently, by what Pi draws. *Corrected
   during implementation:* the first version mapped `title class_` to the
   type color, by Pi's `class` key. Running Pi's own `highlightCode` on
   `class Foo extends Bar` showed `Foo` and `Bar` in the function color,
   because 10 marks a class name as a `title` inside a `class` and the inner
   key wins; and `this` in the type color, as a `built_in`. The table now
   carries what Pi draws.

   The stylesheet test keeps holding every token to both blocks, and the
   scan every class to the vocabulary; a test holds the mapping (9).

2. **The transcript model.** `conversations/transcript.ts` keeps what the
   rows need:
   - `assistant`: `{ text, thinking, done, stopReason? }`; `thinking_delta`
     appends to `thinking` on the open row, creating it if none is open;
     `errorMessage` leaves the row and becomes a notice (below).
   - `tool`: `{ toolCallId, name, args: unknown, done, isError?, durationMs?,
     result? }`; `tool_end` sets `result` from `resultText`.
   - `notice`: `{ name, tone: "notice" | "danger", text }`, built by three
     constructors exported beside the reducer and used by it and by the
     store, so the three notices have one home: `retryNotice(event)` →
     `{ name: "Retry <attempt> of <max>", text: "<message> · retrying in <delay>" }`
     with the delay formatter private beside it; `providerErrorNotice(message)`
     → `{ name: "Provider error", tone: "danger" }`, and `message_end` with an
     `errorMessage` closes any open assistant row and adds it. *Corrected
     during implementation:* not when the message was aborted. Pi ends a
     stopped message with "Request was aborted", which is the person's own
     act and not a provider's error; what a stop leaves is CV1.DS2's;
     `extensionNotice(event)` → `{ name: "Extension failed", text:
     "<extension> on <event>: <message>" }`, which the store uses.
   - `user` and `diagnostic` unchanged.
   - `transcript/format.ts`, pure, carries Pi's folded forms with their
     constants and provenance (`formatToolCallWithArgs`, `formatToolDuration`
     in Pi's `core/tools/render-utils.js`): the preview as `key=JSON(value)`
     pairs joined by spaces, cut at 100 characters with `...`; the duration
     as `4.2s` under a minute, `1m 30s`, `2h 3m 4s`; the expanded argument
     form, a string as it is and the rest as indented JSON.
   - The `TranscriptRow` is adapted in the same slice, so the model change
     commits green; the reducer's tests change with the shapes.

3. **Markdown.** `transcript/Markdown.tsx` renders an assistant row's text
   through `react-markdown` with `remark-gfm` and `rehype-highlight`
   (`detect: false`), the story's `urlTransform` (D4), and a `components`
   map that puts the tokens on each element: headings (D3), paragraphs,
   `ul`/`ol` with the marker in `--color-list-marker`, inline `code` in
   `--color-code`, `a` (D4), **`img` rendered as its alt text muted in
   brackets, never an element** (the CSP would block the fetch, but a
   `data:` image would draw and a broken image is a foreign object),
   `strong`/`em`/`del` as styles, `blockquote` muted with a muted left
   border, `hr` as a hairline, `table` with hairlines, a bold header row and
   cells that wrap within the measure, `pre` as the code block (4).
   *Corrected during implementation:* a paragraph keeps its soft line
   breaks (`whitespace-pre-line`), because Pi's own Markdown renderer draws
   them as new lines where HTML would join them; only paragraphs, so the
   newlines between blocks never become blank lines. **Rhythm**, which is not a Pi
   role and is said so in the stylesheet: one line (24 px) between blocks;
   above `h1` and `h2` one line and a half, above `h3` and below one line,
   so levels differ by air at one size; lists and quotes at the block gap.
   While a row streams, the text re-renders on each delta; a finished row is
   memoized by its text.

4. **Code blocks.** `transcript/CodeBlock.tsx` (D5): the `pre` on the raised
   ground inside a hairline, mono, lines wrapped (R2); the `hljs` class on
   the `code` element decides between highlighted spans and the code-block
   green; the hidden-character markers; the Copy button with the accessible
   name "Copy code", copying the code node's text read from the syntax tree
   (`hast`) rather than the DOM, so the markers are not copied and the
   hidden characters are; "Copied" for 1.5 s, the timer reset on re-click
   and cleared on unmount. The transcript's measure is `select-text`.

5. **Tool rows.** `transcript/ToolRow.tsx` (D6), keyed by `toolCallId` in
   the log: the folded form on the state's ground; the button carries
   `aria-expanded` and controls the panel; the panel lists each argument
   (`key` muted, the value in full) and the whole result muted in a `pre`
   that wraps. A tool whose `tool_end` never arrives stays on the pending
   ground with the pulse (what Stop leaves behind is DS2's).

6. **Thinking.** `transcript/Thinking.tsx` (D7), rendered inside the
   assistant row before its Markdown; the fold is a button with
   `aria-expanded`; the row's state holds the override and the fold rule
   reads `following` from the transcript. The thinking itself is plain text
   in the thinking color, italic, `whitespace-pre-wrap`.

7. **Notices.** `transcript/Notice.tsx` (D8): the name bold, the text after
   it, in the tone's color, `text-ui`.

8. **Following the stream.** `transcript/Transcript.tsx` takes the log out
   of `Conversation.tsx` and owns rows and following, nothing else: the
   opening and failed states stay in `Conversation.tsx`, which only they
   concern. `follow.ts`, pure: `isAtBottom({ scrollTop, scrollHeight,
   clientHeight })` within 24 px. The component keeps a `following` flag:
   set on mount and on "Jump to latest", set or cleared by each scroll
   event from `isAtBottom`; on each change of rows it scrolls to the end,
   instantly, only while following. The button is `Jump to latest`,
   floating at the bottom edge of the log on the raised ground, shown while
   not following.

9. **Fixtures and tests.** Invented and inert, under
   `testing/fixtures/`, one text block per assistant message so TD-001's
   rule holds (if a fixture needs two, TD-001 is paid in this story by
   allowing `"\n"` between blocks, and the ledger says so):
   - `markdown-answer`: two heading levels, a paragraph with bold, italic,
     inline code and a link to `https://example.test/…`, a list, a fenced
     `ts` block that exercises every mapped role (a keyword, a function
     name, a class name, a variable, a string, a number, a comment), a
     fence named `foo`, a bare fence, a block with one bidi control
     character and one long line, a table, a quote, a rule, streamed in
     deltas that split inside the syntax (`**bo` / `ld**`) so reassembly
     is proven;
   - `tool-use`: "Let me look." (`toolUse`), a `bash` call with a `command`
     under `/Users/test/`, a twelve-line result, a second call that fails,
     then "Three files.";
   - `thinking-answer`: thinking deltas, then text deltas;
   - `retried-answer`: a `retry` (1 of 3, 2000 ms, "overloaded"), then the
     answer;
   - `provider-error`: a partial answer, then `message_end` with
     `stopReason: "error"` and an `errorMessage`;
   - `unsafe-answer`: raw HTML (`<img onerror=…>`, `<script>` split across
     two deltas), a `javascript:` link, a `data:` link, an `http:` link, a
     `mailto:` link, a bare `www.` literal, a remote image and a `data:`
     image, as text in a fixture, which the loader's content rules allow.
   - **The harness grows one entry:** a scripted turn may carry
     `extensionErrors`, host events played through the same fan-out after
     the prompt is answered and before the turn's events, failed at
     teardown if never exercised, as held turns are. `session.extension_error`
     is a host event, not a session event, so a fixture cannot carry it.

   Tests:
   - `conversations/transcript.test.ts`: thinking kept on the row; the tool
     row's args and result; each notice's name and tone through its
     constructor; the provider error closes the row and adds the notice.
   - `transcript/format.test.ts`: the preview at and over 100 characters,
     the duration's three shapes, the expanded argument form.
   - `transcript/follow.test.ts`: `isAtBottom` at, near and off the bottom.
   - `transcript/Markdown.test.tsx`, rendered alone: the heading is a
     heading with no `#`, carrying the heading token's class; `**` is gone
     and the text is in `strong`; inline code is in `code` with its token
     class; list items are items; **the `ts` fence has, for every mapped
     role, the class the fixture produces, and each such class is matched
     by a selector `app.css` defines**, read from disk as `tokens.test.ts`
     reads it; the `foo` fence and the bare fence carry the code-block
     class and no highlight spans; the bidi character renders as the marker
     and is in the copied bytes; the table has its rows and header; raw
     HTML is text; the `javascript:`, `data:`, `http:`, `mailto:` and `www.`
     links have no `href` and the `https:` one has; no `<img>` lands; Copy
     writes the fence's exact content to a stubbed clipboard and reads
     "Copied" (the revert is route-verified); a click and an `auxclick` on
     the `https` link call the opener (`scriptIpc` on
     `plugin:opener|open_url`, arguments asserted) and are prevented; an
     opener that refuses yields a toast; no `target` attribute is rendered;
     a URL-shaped link text with a different host shows the host (R3).
   - `transcript/Transcript.test.tsx`, against the fake host, one case per
     fixture, **each streaming assertion at a named release point**
     (`releaseThrough`): past the first heading's deltas, the heading is
     there; after the whole turn, no `**` or backtick is text; through
     `tool_start`, the row is on the pending ground with the pulse and
     `aria-expanded=false`; after `tool_end`, ✓ with its duration, the
     ten-line preview and "… 2 more lines", ✗ on the failing one, then the
     row opened on its arguments and the whole result; through a
     `thinking_delta`, thinking open; past the first `text_delta`, folded to
     "Thinking…", and "Thought" after the end, toggled by click; the retry
     notice named with its attempt and message in the notice tone's class;
     the provider error named in the danger class; the extension failure
     named, through `extensionErrors`; the `unsafe-answer` turn rendering
     every intermediate string without an element or an error; and
     following: with the log's `scrollTop`, `scrollHeight` and
     `clientHeight` stubbed (happy-dom lays nothing out), `scrollTo` is
     called on a new row while at the bottom, is not called after a scroll
     event off the bottom, "Jump to latest" appears on that scroll, and
     activating it calls `scrollTo` and hides the button; and the thinking
     fold does not apply while the view is held.
   - `styles/tokens.test.ts` stays as it is and proves the new tokens are
     in both blocks; the scan holds the new classes.
   - Existing tests keep their roles and text oracles. One that asserts the
     old plain rendering (`exactly(answer)` on a two-line answer, the tool
     row's JSON slice) is changed for the new rendering and said so in the
     report, not silently.

10. **Docs.** A decision, D16, "The transcript renders Markdown and code on
    Pi's engine and mapping" (the stack and its exact pins, the
    sanitization posture resting on react-markdown's defaults and
    therefore reviewed on every bump, `https`-only links, images as text,
    the mapping carried by meaning into highlight.js 11, headings at one
    size); `AGENTS.md` (raw HTML is never rendered in the transcript;
    links open outside and only `https`; Pi's transcript roles are tokens;
    the `extensionErrors` entry in the harness list); `README.md` only if
    the stack line changes; the story's `index.md`, the roadmap rows, the
    worklog, TD-001 if paid, and a ledger entry at Debt Review for a
    Rust-side webview navigation guard, the layered defense this story
    does not build.

## Non-Goals

- Do not implement sibling roadmap item: Composer (US3). The composer does
  not change.
- Do not implement CV1.DS2's scope: what Stop does to a turn and the mark it
  leaves; sessions listed and resumed.
- No diff rendering and no `toolDiff*` tokens beyond the highlighter's
  `addition`/`deletion` classes: the protocol carries no diff. Carrying the
  edit tool's diff is a protocol change for a later story, captured there.
- No tool-specific renderers; no images, in results or in Markdown; no
  `queue_update` display; no `thinking*` level colors, `bashMode` or
  `customMessage*`.
- No setting to hide thinking; no Markdown in user rows or in thinking; no
  LaTeX, Mermaid, link previews, search or export; no size scale for
  headings; no horizontal scroll.
- No host, protocol or Rust change; no new permission, so no `http`,
  `mailto` or `tel` links; no dependency beyond the three in D1.

## Acceptance Behavior

```text
Given an assistant answer with a heading, inline code, a list, a link, bold text and a fenced block with no language
When it renders in the dark theme
Then the heading is #cd9a22, the inline code and the list markers #a798d7, the link #69add0, the bold text bold and the block #68b78d, as Pi draws them
And no Markdown syntax, such as ** or a backtick, is shown as text

Given the same answer streamed in deltas that split inside the syntax
When each delta arrives
Then the transcript re-renders without an error, and once the message ends it reads as above

Given a fenced block whose language highlight.js knows
When it renders
Then every mapped role carries Pi's syntax token through a selector the stylesheet defines, and a fence named foo or a bare fence carries the code-block color and no highlight span
And a long line wraps
And a bidi or zero-width character shows as a marker
And Copy puts the fence's exact content on the clipboard, hidden characters included, and reads "Copied" for a moment

Given an answer with a table
When it renders
Then it is a table with a bold header row, hairlines between cells, and cells that wrap within the measure

Given raw HTML, an image, and links with the schemes javascript:, data:, http:, mailto: and a bare www. literal in an answer
When it renders
Then the HTML is text, the image is its alt text, and none of those links has a target; only an https link does

Given an https link
When the person clicks it, with any button
Then the opener is asked to open its URL, the window does not navigate, and a refusal is said as a toast
And when the link's text is itself a URL with a different host, the target's host is shown muted after it

Given a turn with a tool call that succeeds with twelve lines of output and one that fails
When each starts and ends
Then each is Pi's folded form: the pulse then ✓ in success or ✗ in danger, the name in bold, the arguments' preview within 100 characters, the duration, on the pending, success or error ground, and up to ten lines of the result with "… 2 more lines"
And opening a row shows every argument in full and the whole result, with no scroll of its own; closing folds it

Given a turn in which the model thinks before answering, with the view following
When the thinking streams
Then it shows open, muted and italic in Pi's thinking color
And once the text begins it folds to "Thinking…", then "Thought" when the message ends, and a click opens it again

Given the same turn with the view held
When the text begins
Then the thinking stays open until the person folds it or following resumes

Given a retry, a provider error and an extension failure
When each arrives
Then a notice named "Retry 1 of 3", "Provider error" or "Extension failed" shows with the message, the first and last in the notice color, the second in danger

Given the view at the bottom
When a row changes
Then the view scrolls to the end, instantly, and "Jump to latest" is not shown

Given the person has scrolled up
When a row changes
Then the view does not move and "Jump to latest" is shown
And activating it scrolls to the end, hides the button and the view follows again

Given the stylesheet
When the .light block is compared with the @theme block
Then every new --color-* token @theme defines, .light overrides

Given the dark theme beside a Pi window (Navigator, at the route)
When the Navigator reads an answer with every element and a turn with tool use
Then it reads as Pi draws it, in Pi's colors on Mirror's ground
```

## Approach

Test first, one slice at a time, each committed green:

1. The tokens, the highlight mapping block, and the stylesheet test green.
2. The reducer and the notice constructors; `format.ts` and `follow.ts`,
   pure, with their tests; the `TranscriptRow` adapted to the new shapes;
   the store's extension notice through its constructor.
3. The dependencies (D1) installed and pinned; `Markdown.tsx` and
   `CodeBlock.tsx` with their tests, rendered alone, the `markdown-answer`
   and `unsafe-answer` fixtures; the `TranscriptRow` moved to `transcript/`
   and drawing the assistant row through them.
4. `ToolRow`, `Thinking`, `Notice`, each with its fixture and its UI test;
   the harness's `extensionErrors`.
5. `Transcript.tsx` with following and "Jump to latest", the fold's follow
   rule, its test; `Conversation.tsx` reduced to the header, the states, the
   transcript and the composer.
6. Docs, the gate, the validation route.

An early look is not planned as a checkpoint: the route reads everything
at once. If the Navigator wants to read the Markdown beside Pi before the
tool rows and thinking are built, slice 3 is where to stop and say so.

## Risks

- **Re-parsing on every delta.** A long answer parses whole on each delta.
  Finished rows are memoized and blocks above 32 KB are not highlighted; if
  the route shows the stream stuttering on a long answer, parsing on an
  animation frame is the fix, inside this story.
- **`navigator.clipboard` in WKWebView.** Works on a user gesture in current
  macOS; if the route finds it refused, the Tauri clipboard plugin is the
  fallback, which is a dependency and a permission: a stop, not an
  absorption.
- **The `title` tooltip in WKWebView.** Expected to surface on hover; if the
  route finds it does not, the URL muted after the text, Pi's own fallback,
  is the fix, as a decision.
- **A language lowlight's common set lacks.** The block falls back to the
  code-block green, as Pi does for a language it does not know; the route
  reads the languages the Navigator uses (TypeScript, Rust, bash, JSON,
  YAML, SQL, Markdown) and records any gap.
- **The link that navigates.** An `<a>` the opener does not catch navigates
  the webview away from the app. `click` and `auxclick` are prevented and
  tested; the route clicks a real link; the Rust-side guard is a ledger
  entry.
- **Scroll in happy-dom.** No layout, so the metrics are stubbed; the test
  proves the logic, the route proves the feel: the hold, and a long answer
  followed to the end with the button never appearing (the 24 px threshold
  is the first value to tune).
- **`::marker` in WebKit.** Color on `::marker` is supported; if the route
  finds the marker uncolored, the list renders its own marker in a span.
- **An existing test changes.** Said in the report with the rendering
  reason; a test that needs changing for any other reason is a stop.

## Validation Route

- **Automated**, in the [test guide](test-guide.md): the chained gate
  (typecheck, test, build, `git diff --check`), the new unit, component and
  UI tests above, three shuffled runs of the desktop project. Hex values are
  not provable there: a test proves each element carries its token's class
  and the stylesheet carries the value; the color is the Navigator's alone.
- **Navigator, in the real app** (`npm run dev`, a Journey he names, dark,
  beside Pi in iTerm):
  1. Ask for an answer with two heading levels, a list, a link, inline
     code, bold text, a TypeScript block with a long line, a bare block, a
     table and a quote: each in Pi's color, no syntax shown, the stream
     reassembling correctly, the long line wrapped, the levels told apart
     by their air.
  2. Hover the TypeScript block, press Copy, paste in a terminal: "Copied"
     for a moment, then the exact text.
  3. Click the link: the browser opens it, the app stays; hover it: the
     URL as the title.
  4. Ask for a turn that runs `ls` on a directory with more than ten
     entries, then one that runs a command that fails: Pi's folded form on
     each, the ten-line preview and "… n more lines", ✓ and ✗ in their
     colors on their grounds; opening shows the whole result with no scroll
     of its own.
  5. With thinking on, ask something that makes the model think: open while
     streaming, folded once the text begins, toggled by click.
  6. During a long answer, scroll up: the view holds; "Jump to latest"
     appears; activating it returns and follows. Then leave the view at the
     bottom through a whole long answer: it follows to the end and the
     button never appears.
  7. Disconnect the network mid-turn: a "Retry n of m" notice; let it fail:
     a "Provider error" in danger. If the provider does not retry on this
     network error, record it; the step passes on the fixture tests. The
     extension failure is fixture-proven only: nothing in the real app
     provokes it on demand.
  8. Light, on its own: every element legible on the light canvas, the tool
     grounds distinct, the ✓ and ✗ carrying the state on their own, nothing
     reading faint.
- **Pass:** every check and observation holds. **Fail:** any one does not.

E2E decision: required. This story is validated by reading: the fake host
proves each path renders, only the window proves it reads as Pi.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.US2`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- Colors and type come from the tokens; the scan holds every class.
- Carried values are Pi's, converted with Pi's code; the highlight mapping
  and the folded forms are Pi's, tagged with their sources.
- Fixtures are invented and inert; real session text never enters one.
- The three dependencies are pinned exactly; nothing else is added.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- a dependency beyond the three in D1 is needed
- the clipboard needs the Tauri plugin
- a permission change turns out to be needed
- a host or protocol change turns out to be needed
- an existing test needs changing for a reason other than the new rendering
- TD-001 needs paying in a way other than allowing `"\n"` between blocks

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
