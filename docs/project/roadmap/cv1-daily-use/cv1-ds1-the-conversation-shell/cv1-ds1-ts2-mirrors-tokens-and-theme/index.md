[< Parent](../index.md)

# CV1.DS1.TS2 — Mirror's tokens and theme

**Status:** 🟡 Planned
**Type:** Technical Story
**Split from:** [CV1.DS1.US1](../cv1-ds1-us1-shell-and-journeys-sidebar/index.md), on its [plan review](../cv1-ds1-us1-shell-and-journeys-sidebar/plan-review.md)

---

## Technical Story

In order for the shell to read as Mirror's instrument and not a starter kit,
As the Driver building CV1.DS1,
I want the layout, typography and dark and light tokens to be the product's own, with a theme that follows the system until the person chooses,
So that US1's screens, and everything US2 and US3 add to them, are built on one coherent visual vocabulary.

## Outcome

One product in two lights. Both themes derive from one accent hue (the
predecessor's mint) and one danger hue, luminance tuned per theme, on one
role vocabulary: canvas, sidebar, raised surface, text, muted text,
hairline, selection, hover, accent, accent-foreground, ring, notice,
danger. Type roles instead of one base size; radius and one motion idiom;
a three-tier alarm scale. The theme preference (system, dark, light) is
applied before the first frame, follows the OS live under `system`, and
survives a relaunch of the built app. The spike's chrome is gone.

## Acceptance Behavior

```text
Given no stored preference
When the app launches on a system that prefers light
Then the first frame is light, with no dark flash

Given the theme control
When the person chooses dark, or light, or system again
Then the choice applies at once, exactly one of the classes is on <html>, and a relaunch of the built app finds it

Given system is chosen
When the OS appearance changes
Then the app follows

Given the stylesheet
When the .light block is compared with the @theme block
Then every --color-* token the theme defines, the light block overrides
```

## Scope

- The slot table: every token in both blocks, each tagged carried (file and
  theme) or derived, recorded in D11.
- Type roles: sidebar row, header name and facts, transcript body and meta,
  the conversation's measure.
- State tokens: selection, hover, focus ring, disabled text level; radius
  capped at 6 px; one slow muted indicator shared by opening and streaming.
- The alarm scale: muted, notice, danger; open diagnostics at muted.
- The theme store and control, `localStorage` persistence, the synchronous
  apply in `main.tsx`, the `useTheme` effect with cleanup, the window
  background matching the shell token, `sonner` on the tokens.
- Chrome: "Sign in" in the footer, versions behind a quiet affordance, no
  Sparkles or Compass.
- Harness: ambient theme state cleared per test in `setup.ts`; happy-dom's
  `change` dispatch verified or polyfilled.

## Out Of Scope

- The predecessor's other theme families; a bundled brand font pair.
- The shell's behavior, states and stores (US1).

## Validation

The gate; a CSS completeness test; the theme tests; the real app in both
appearances, launched from the built bundle for the relaunch check, with the
origin recorded.
