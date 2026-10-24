[< Parent](../index.md)

# CV1.DS1.US2 — Transcript rendering

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a user,
I want to Transcript rendering,
So that I can receive the value of this story.

## Outcome

Navigator can validate Transcript rendering as an observable behavior.

## Acceptance Behavior

```text
Given the user is ready for Transcript rendering
When the user performs the planned action
Then the expected observable behavior is visible
And unrelated Delivery Story scope remains untouched
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

- Transcript rendering
- Pi's Markdown colors, as captured above

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Navigator-visible validation route plus automated checks.
