[< Story](index.md)

# Test Guide — CV1.DS1.US2 Transcript rendering

## Automated Validation

From the repository root, the gate:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Then the story's own tests, and the desktop project shuffled three times,
since the transcript tests share the fake host and the harness's ambient
state:

```bash
npx vitest run apps/desktop/src/conversations/transcript.test.ts --project desktop
npx vitest run apps/desktop/src/transcript --project desktop
npx vitest run apps/desktop/src/styles/tokens.test.ts --project desktop
npx vitest run --project desktop --sequence.shuffle --sequence.seed=1
npx vitest run --project desktop --sequence.shuffle --sequence.seed=2
npx vitest run --project desktop --sequence.shuffle --sequence.seed=3
```

Expected: every run green; no `console.error`, no violation, no fixture
refused by the loader. No Rust, host or bundle change is planned, so
`cargo check` and a real turn through the host are not part of this gate
unless the implementation touches them, in which case this guide says so.

What the tests prove, and what they cannot: each element carries its
token's class, the stylesheet carries the value in both themes, and every
class the highlight mapping produces is matched by a selector the
stylesheet defines; happy-dom applies no CSS, so the color itself is the
Navigator's alone, below. The "Copied" label is proven to appear; its
revert after 1.5 s is route-verified. The Copy button is always findable in
a test; its discoverability on hover is route-verified. The
extension-failure notice is proven through the fake host's
`extensionErrors` only: nothing in the real app provokes it on demand.

## E2E Decision

Required. The fake host proves each rendering path from invented fixtures;
only the window proves that an answer reads as Pi draws it, that a link
opens outside, that the clipboard works in the webview, and that following
the stream feels right.

## Navigator Validation

`npm run dev`, Appearance dark, a Journey the Navigator names, beside a Pi
window in iTerm.

| Step | Do | Expected observation |
|---|---|---|
| 1 | Ask for an answer with two heading levels, a list, a link, inline code, bold text, a TypeScript block with a line longer than the measure, a bare block, a table and a quote | Headings `#cd9a22` bold at the body size, the levels told apart by the air above them; inline code and list markers `#a798d7`; link `#69add0` underlined; bold bold; the bare block `#68b78d` on the raised ground; the TypeScript block with keywords blue, strings orange, function names yellow, types violet, comments muted, the long line wrapped; the table with a bold header and hairlines, its cells wrapping; the quote muted with a muted edge. No `**`, `#` or backtick shown. While it streams, the text reassembles without flashing errors |
| 2 | Hover the TypeScript block: the Copy button appears; press it, paste in a terminal | The button reads "Copied" for a moment, then "Copy" again; the paste is the block's exact text, nothing more |
| 3 | Hover the link, then click it | The URL shows as the title; the system browser opens it; the app stays on the conversation |
| 4 | Ask for a turn that runs `ls` on a directory with more than ten entries, then one that runs a command that fails | Pi's folded form per call: the pulse, then ✓ in `#68b78d` on the success ground or ✗ in `#ea7f81` on the error ground; the name bold, the arguments' preview, the duration; ten lines of output muted and "… n more lines"; opening shows the command and the whole output, the transcript scrolling and nothing scrolling inside the row; closing folds it |
| 5 | With thinking on, ask something the model thinks about | Thinking open, muted and italic in `#96a0a4`, while it streams; folded to "Thinking…" once the text begins and "Thought" when the answer ends; a click opens it again |
| 6 | During a long answer, scroll up; then, on another long answer, leave the view at the bottom | Scrolled up: the view holds where it is, the thinking (if any) does not fold under the eye, "Jump to latest" floats at the bottom on the raised ground; activating it returns to the end and the view follows again. Left alone: the view follows to the end and the button never appears |
| 7 | Disconnect the network mid-turn, then let the turn fail | "Retry n of m" in the notice color with the provider's message and "retrying in …"; then "Provider error" in the danger color. **If no retry is observed on this network error, record it: the step passes on the fixture tests.** The extension failure is not in the route; it is fixture-proven only |
| 8 | Appearance light, read the same transcript | Every element legible on the light canvas: headings `#8f6802`, code `#7459b4`, link `#2f7899`, block `#337e58`, thinking `#7c868c`; the three tool grounds distinct, and the ✓ and ✗ carrying the state on their own; nothing faint |

**Pass:** every observation holds, step 7 by its own rule. **Fail:** any
other one does not, or the app navigates away on a link, or the clipboard
refuses, or the view jumps while scrolled up, or the title does not show on
hover.

## Validation Evidence

**Automated, 2026-10-24.** `npm run typecheck && npm test && npm run build
&& git diff --check`: green, 248 tests (12 node, 236 desktop); the desktop
project green under shuffle seeds 1, 2 and 3. Each rule the story stands on
was broken once by hand and its test failed by name: the unknown-language
pass removed, the `this` rule taken out of the mapping, the image override
removed, react-markdown's default `urlTransform` restored, the link's
`preventDefault` removed, the thinking's fold disabled, a tool ground
swapped, the follow rule's "only a move up" guard removed, and the hold
removed. Each file was restored.

What changed in tests that existed: the reducer's and the store's tests take
the new row shapes (thinking on the answer, the call's arguments and result,
named notices). Two UI tests now name the paragraph they read, because the
answer is a `<p>` inside its row and, mid-stream, the partial text is
already Markdown (`App.test.tsx`, `Conversation.test.tsx`). No other test
changed.

Found while building, and settled in the plan as corrections: Pi draws a
class name in the function color, not the type color; `rehype-highlight`
adds `hljs` before it tries a language, so an unknown one is detected by
the message it leaves; Pi keeps a paragraph's soft line breaks; and Pi ends
a stopped message with "Request was aborted", which is not named a provider
error.

Two things for Debt Review. The JavaScript bundle grew from 397 KB to
744 KB (gzip 119 KB to 225 KB), almost all of it highlight.js's 37 common
grammars and the unified tree, and Vite now warns about a chunk over
500 KB. TD-001's trigger did not fire: every fixture's assistant message
has one text block.

**Navigator.** Pending: the route above, in the real app.
