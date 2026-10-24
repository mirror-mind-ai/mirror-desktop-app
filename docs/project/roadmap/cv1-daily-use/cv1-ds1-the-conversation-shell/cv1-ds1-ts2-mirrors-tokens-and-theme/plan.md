[< Story](index.md)

# Plan — CV1.DS1.TS2

## Objective

Give the shell Mirror's own look, carried from Pi. US1 built the screens on
the scaffold's tokens: two unrelated palettes, a system sans stack,
consumer-chat radii, a spinner and a pulsing dot. This story replaces them
with one visual vocabulary in two lights, taken from the one reference the
Navigator named: Pi as he reads it every day.

That reference, read from the machine rather than guessed:

- **Pi brings colors, not a font.** Pi is a terminal program; the typeface
  and weight the Navigator likes are the terminal's. He runs Pi in iTerm2
  (profile `Default`): **Monaco 18 pt**, antialiased, bold synthesized, on
  the profile's background **`#1e1e2e`** (both the light and the dark
  variant of the profile use it). Pi's theme setting is fixed to **`dark`**
  (`~/.pi/agent/settings.json`), so what he sees is Pi's `dark` palette on
  `#1e1e2e`, in Monaco.
- **Pi's palettes are a matched pair.** `dark.json` and `light.json` in
  `@earendil-works/pi-coding-agent/dist/modes/interactive/theme/` define the
  same roles from the same hues, OKHSL, with lightness tuned per
  appearance, which is what the US1 review asked for (one product in two
  lights). Pi converts OKHSL to hex with its own code for HTML exports; the
  slot table below used that converter (`pi-tui/dist/colors.js`), so every
  carried value is Pi's, not an approximation.
- **Monaco ships with macOS.** No font is bundled; the bundle does not
  change.

The result: the whole window set in Monaco, Pi's hues, the dark canvas the
Navigator already reads on, a light theme from the same vocabulary, a theme
preference that follows the system until chosen and survives a relaunch of
the built app, a launch with no flash, and the spike's chrome gone.

This is the second version of the plan, revised after a four-lens review
and approved with the Navigator's rulings; see
[plan-review.md](plan-review.md).

## Decisions taken

| | Decision | Ruling |
|---|---|---|
| D1 | The typeface | **Monaco everywhere**: sidebar, header, transcript, composer, footer, states; one face, emphasis by synthesized bold. The system sans for the chrome stays the fallback if Monaco fails the sidebar (route). |
| D2 | The hues | **Pi's**: violet accent (295), blue focus ring and selection (232), green success (159), red danger (20), yellow notice (83). Supersedes the index's "predecessor's mint". |
| D3 | The canvases | Dark **`#1e1e2e`**, from the iTerm profile. Light **`#efeeee`**, Pi's own export page. |
| D4 | The reading size | **16 px / 24 px** for transcript and composer; one token to turn. |
| D5 | The appearance control | A quiet button in the sidebar footer cycling System → Dark → Light, **its icon showing the current choice** (monitor, moon, sun; R4) and its accessible name stating it. The cycle passes through dark on the way to light; if that jars in the route, a small menu is the recorded fallback (R5). |
| D6 | The measure | **72 ch, centered**, for the transcript and composer (R2); judged beside Pi at the checkpoint. |
| R1 | An early look | **A Navigator checkpoint mid-implementation**: once the tokens are in and the transcript, composer and header are restyled, the Navigator reads them beside a Pi window before the rest of the chrome is restyled. |
| R3 | The title | **16 px bold**, the body size; the facts beside it stay 13 px muted. |

**Checkpoint (R1), 2026-10-24.** The Navigator read the dark transcript
beside Pi: the face passes. The text read monochrome, because Pi's colors
along the text are its Markdown roles and the transcript does not render
Markdown yet. By the Navigator's ruling, Markdown in Pi's colors stays in
CV1.DS1.US2, captured in its index, and this story continues with the rest
of the chrome.

**Light is judged on its own.** The Navigator reads Pi only in dark, so the
light theme has no lived reference: it is judged on its coherence and the
legibility of every state, not on fidelity. Tuning light values after the
route is expected work inside this story, not a scope change. The two
themes are not symmetric, and the plan says so: the dark surfaces derive
from `#1e1e2e` and carry its violet cast (OKHSL hue 284), while the light
surfaces carry Pi's warm neutral (hue 17) under a cool blue selection;
whether light's surfaces should move toward the dark's hue family is a
route observation. Measured already: Pi's light `muted` on the light
canvas is 4.3:1, under 4.5:1; it is the first candidate if light reads
faint. (Paid in Debt Review: `#636c71`, 4.63:1.)

## Scope

1. **The slot table.** `apps/desktop/src/styles/app.css` is rewritten on
   the role vocabulary: Tailwind's own palette, text sizes, radii and
   animations are cleared (`--color-*: initial` and the like), so the
   stylesheet is the whole vocabulary; every token is defined in `@theme`
   (dark, the default) and overridden in `.light`. The scaffold's names
   (`background`, `card`, `muted`, `border`) go and the shell's classes
   follow. Token names are chosen so utilities read: `text-muted`, not
   `text-text-muted`. Values, each tagged **carried** (file and theme) or
   **derived** (rule, computed with Pi's converter from the canvas):

   | Token | Role | Dark | Light |
   |---|---|---|---|
   | `--color-canvas` | the conversation area's ground | `#1e1e2e` carried, iTerm `Default` background | `#efeeee` carried, Pi light `export.pageBg` |
   | `--color-sidebar` | the sidebar | `#252537` derived, canvas +3 % L | `#f3f2f2` derived, canvas +1.5 % L |
   | `--color-raised` | composer field, code chips | `#2c2c40` derived, canvas +6 % L | `#f7f6f6` carried, Pi light `export.cardBg` |
   | `--color-ink` | body text | `#dee0e1` carried, Pi dark `text` | `#3b3f41` carried, Pi light `text` |
   | `--color-muted` | secondary text, facts, meta | `#9da5a9` carried, Pi dark `muted` | `#636c71` derived, Pi light `muted` (`#677176`) two points darker, to keep 4.5:1 (Debt Review, D15) |
   | `--color-dim` | disabled text (never opacity) | `#7e888e` carried, Pi dark `dim` | `#879095` carried, Pi light `dim` |
   | `--color-hairline` | the only border | `#35354c` derived, canvas +10 % L (Pi's `borderMuted` is a drawn box line, too strong at 1 px) | `#dedcdc` derived, canvas −6 % L |
   | `--color-selection` | the current row's fill | `#213b49` carried, Pi dark `selectedBg` | `#dfe7ec` carried, Pi light `selectedBg` |
   | `--color-hover` | hover, an overlay over any ground | white at 6 % derived | black at 5 % derived |
   | `--color-accent` | the accent | `#a798d7` carried, Pi dark `accent` (violet) | `#7459b4` carried, Pi light `accent` |
   | `--color-on-accent` | text on the accent | `#1e1e2e` derived, the canvas (6.3:1) | `#ffffff` derived (5.5:1) |
   | `--color-focus` | the keyboard focus ring | `#5fa8cc` carried, Pi dark `border` (the editor's focus border) | `#3d8eb3` carried, Pi light `border` |
   | `--color-notice` | retries, extension notices | `#cd9a22` carried, Pi dark `warning` | `#8f6802` carried, Pi light `warning` |
   | `--color-danger` | failures only | `#ea7f81` carried, Pi dark `error` | `#c8253d` carried, Pi light `error` |
   | `--color-success` | a step that succeeded | `#68b78d` carried, Pi dark `success` | `#337e58` carried, Pi light `success` |
   | `--color-user-message` | the person's own rows | `#213b49` carried, Pi dark `userMessageBg` | `#dfe7ec` carried, Pi light `userMessageBg` |

   Hover is an overlay rather than a fixed color so it shows on every
   ground: a fixed hover one step above the canvas would sit one point above
   the sidebar and vanish there (review). The table is recorded as D15,
   "Mirror's look is carried from Pi, revisable per role", so US2 carries
   Pi's remaining roles (`md*`, `syntax*`, `tool*Bg`, `toolDiff*`) from the
   same two files the same way, and a later departure from Pi is a decision,
   not a contradiction.

2. **Type roles**, as tokens, Monaco throughout (D1):
   `--font-sans` and `--font-mono` are both `Monaco, ui-monospace, Menlo,
   monospace`; `--font-display` goes. Roles: `ui` 13 / 18 (sidebar rows,
   header facts, footer, tool rows), `body` 16 / 24 (transcript, composer,
   the area's statements; D4), `title` 16 / 24 bold (the header's name,
   state headings; R3), `meta` 12 / 16 (diagnostics, versions). Weight is
   regular everywhere; emphasis is bold, which WebKit synthesizes as iTerm
   does (Monaco has one face); the current sidebar row is bold. The
   transcript and composer sit in a measure of 72 ch, centered (D6).

3. **State and motion tokens.** `--radius-control: 4px`, the only radius.
   The focus ring on `:focus-visible` only, in `--color-focus`. Disabled
   controls use `--color-dim`, never opacity. One motion: a slow pulse
   (opacity 1 → 0.4 → 1, 1.6 s) on one muted glyph, never on a label, shared
   by the sidebar's working row (in a reserved leading slot, so nothing
   reflows) and the transcript's streaming cursor. Under
   `prefers-reduced-motion` the glyph stands still at full muted strength.
   The `Loader2` spinners and the accent dot go.

4. **The theme**, in `apps/desktop/src/theme/`, with one writer for each
   effect:
   - `resolve.ts`, pure: the preference type, `parsePreference(stored)`
     (unknown or missing is `system`), `resolveTheme(preference,
     systemPrefersDark)`, `nextPreference` (the cycle), and each theme's
     canvas for the window, which a test holds equal to `app.css`.
   - `store.ts`: `{ preference, systemPrefersDark }` from one
     `initialState`, registered for reset; the resolved theme is derived,
     never stored. Actions are pure transitions: `hydrateTheme`,
     `cycleAppearance`, `systemAppearanceChanged`.
   - `environment.ts`: what the theme touches, as one interface (storage,
     `<html>`, the `(prefers-color-scheme: dark)` list, the window), and the
     browser's instance of it.
   - `apply.ts`, effectful: exactly one of `dark`/`light` on `<html>`
     (`color-scheme` follows from the class in CSS), then the window told
     its ground and its appearance: `setBackgroundColor(canvas)`, and
     `setTheme(preference)` for dark or light but `setTheme(null)` for
     system. Null matters: a window forced dark reports dark to the page's
     own `prefers-color-scheme`, so forcing it under system would make the
     app follow itself. The window calls are fire-and-forget and caught,
     with a warning, so a refused call never becomes an unhandled
     rejection.
   - `lifecycle.ts`: `bootTheme(env)` before the first render (read the
     stored preference and the system appearance, hydrate the store, apply
     once, synchronously for the class), called by `main.tsx` **and** by
     `renderApp()` in the same position, so every UI test boots as the app
     does; and `syncTheme(env)` while the app runs, the sole writer after
     boot: on each change of preference or resolved theme it applies, on a
     change of preference it persists (`localStorage`,
     `mirror-desktop.theme`), and it feeds the system list's changes to the
     store; it returns its cleanup, run by an effect in `App`.
   - The appearance control in the sidebar footer (D5).
   - `Toaster` follows the resolved theme and takes its colors and face from
     the tokens; `theme="dark"` is no longer hardcoded.
   - Two window permissions in the capabilities file:
     `core:window:allow-set-background-color` and
     `core:window:allow-set-theme`.

5. **Chrome on the tokens.** Every shell component restyled, with no
   behavior change: `Sidebar` (rows one line, the indent per level, the
   current row's selection fill and bold, the hover overlay, the working
   glyph in the leading slot, the "No project path yet" second line in
   muted, the footer's quiet "Sign in", appearance control and "About"),
   `Conversation` (the header's name in `title`, facts in `ui` muted, the
   measure), `Composer` (the field on `--color-raised`, hairline, Send on
   the accent, Stop quiet), `TranscriptRow` (user rows on
   `--color-user-message` at the control radius, the streaming cursor on
   the shared pulse, error text on `--color-danger`, notices on
   `--color-notice`, diagnostics muted; the row kinds and their content are
   unchanged, US2 owns their rendering), `EmptyConversation`,
   `HostUnreachable`, `RefreshJourneys`, `SignInPanel` / `SignIn` (classes
   only).

6. **Harness.**
   - The IPC door also installs Tauri's window mock (`mockWindows("main")`):
     the window API reads the current window's label from metadata that the
     IPC mock alone does not set, so without it the first window call would
     throw in every UI test.
   - `renderApp()` scripts the two window commands and boots the theme
     before rendering; the theme tests assert their arguments
     (`plugin:window|set_background_color` with the exact canvas,
     `plugin:window|set_theme` with the theme or null).
   - happy-dom fires a media list's `change` only when it re-checks the
     query on a window `resize`; it does not when the appearance setting
     changes. A harness helper, `setSystemAppearance`, changes the setting
     and dispatches `resize`, which is how a test flips the OS. No
     polyfill.
   - The setup's teardown resets the theme's ambient state (`localStorage`,
     the class on `<html>`, the system appearance) as a named step right
     after unmounting, through one exported function that a test also calls
     to prove one test's choice does not reach the next.

7. **Tests.**
   - `theme/resolve.test.ts` and `theme/store.test.ts`, pure: every
     preference × system pair; an unknown stored value is `system`; the
     cycle; the resolved theme derived from the pair.
   - `theme/lifecycle.test.ts`, on an injected environment: boot applies
     the class synchronously and tells the window; sync applies and
     persists each change, follows the system list under `system`, ignores
     it otherwise, and its cleanup removes the listener.
   - `shell/Appearance.test.tsx`, against the fake host: a launch with no
     stored preference on a light system is light and says "Appearance:
     system"; a stored `dark` after a relaunch opens dark **and the control
     says "Appearance: dark"**; the control cycles, each step applying at
     once with exactly one class, the window told, storage holding the
     choice and the name stating it; under `system` an OS flip changes the
     class and re-issues both window commands; choosing `system` again
     re-follows the OS; an unknown stored value launches on `system` without
     an error; one test's choice does not reach the next.
   - `styles/tokens.test.ts`: every `--color-*` that `@theme` defines,
     `.light` overrides, and nothing else; each canvas in `app.css` equals
     the window's canvas in `resolve.ts`; and a scan of the app's sources
     (`src/**/*.{ts,tsx}`, without `testing/` and tests) in which every
     color and type utility names a token `app.css` defines. The scanner
     lives in `testing/` with a self-test that feeds it known violations
     (`text-red-400`, `bg-card`, `text-sm`, an arbitrary color) and known
     good classes.
   - The existing UI tests stay green: they find elements by role, label
     and text, and `aria-busy` remains the working oracle.

8. **Docs.** D15 with the reference as read, the slot table's source and
   the derivation rule; the story's `index.md`; `README.md` (the stack:
   Monaco, Pi's palette); `AGENTS.md` (colors and type come from the tokens
   in `app.css`, and a test holds every class to them); the roadmap rows;
   the worklog.

## Non-Goals

- Do not implement sibling roadmap item: Transcript rendering (US2).
  Markdown, code highlighting, tool rows, thinking and the follow-the-stream
  behavior are US2's; their Pi roles are named above as what US2 carries
  next from the same files. `TranscriptRow` only changes classes.
- Do not implement sibling roadmap item: Composer (US3). Escape and the
  reasons it cannot send stay there; the composer only changes classes.
- No bundled font, no second typeface, no Pi theme families beyond `dark`
  and `light`, no user-selectable palettes, no sidebar resizing, no icons
  for Journeys.
- No change to the host, the protocol, the stores US1 built (one store is
  added, none changed), the Rust shell's code, or the bundle beyond two
  window permissions.
- No new dependency.

## Acceptance Behavior

```text
Given no stored preference and a system that prefers light
When the app boots
Then <html> carries the light class when boot returns, before the first render, and the window was told the light canvas
And the control says "Appearance: system"

Given dark was chosen and the app is relaunched on a system that prefers light
When it boots
Then it opens dark and the control says "Appearance: dark"

Given the control says "Appearance: system"
When the person activates it once, then again, then again
Then the preference is dark, then light, then system, each applied at once
And after each step exactly one of dark/light is on <html>, the window was told that theme's canvas and the choice (null for system), localStorage holds the choice, and the control's name states it

Given system is chosen
When the OS appearance changes
Then the class follows and the window is told again; once the app unmounts, nothing listens

Given an unknown stored value
When the app boots
Then it is on system, with no error

Given the stylesheet
When the .light block is compared with the @theme block
Then every --color-* token @theme defines, .light overrides, and .light defines no other
And each canvas equals the one the window is told

Given the app's sources
When every color and type utility is checked against app.css
Then each names a token the stylesheet defines

Given the dark theme beside a Pi window (Navigator, at the checkpoint and in the route)
When the Navigator reads the transcript
Then the face is Monaco, the accent Pi's violet and the ground the terminal's; the colors along the text come with US2's Markdown
```

## Approach

Test first, one slice at a time, each committed:

1. The theme's pure parts and store; the harness's window mock, the
   `setSystemAppearance` helper and the teardown step.
2. Apply and the lifecycle on an injected environment; then `bootTheme` in
   `main.tsx` and `renderApp()`, `syncTheme` in `App`, the permissions, the
   appearance control, and the UI tests.
3. `app.css` rewritten on the slot table and the type, state and motion
   tokens; the stylesheet test; the scanner and its self-test; every
   component's classes moved onto the token names, so nothing is left
   unstyled and the scan is green.
4. The transcript, composer and header restyled: the measure, the type
   roles, the pulse.
5. **Checkpoint (R1).** The Navigator reads the dark transcript beside a Pi
   window. Nothing else is restyled until he says it reads right.
6. The rest of the chrome: sidebar rows and footer, the states, sign-in,
   the toaster; light tuned if needed.
7. Docs, the gate, the validation route, the built bundle for the relaunch.

## Risks

- **Monaco at 13 px, and its synthesized bold, in WKWebView.** Chosen at 18
  pt in a terminal, unproven at the sidebar's size; WebKit's synthesized
  bold is not iTerm's. The route reads both; if 13 px reads badly the `ui`
  role goes to 14 px; if bold smears, the selection fill alone marks the
  current row and the title separates by size and full-contrast ink.
- **Monaco in a 256 px sidebar.** Fewer characters per row than the system
  sans; the route reads the Navigator's own Journey names.
- **The pre-paint.** Before the page paints, the window shows its own
  background; `setBackgroundColor` sets the canvas once the app runs. If
  the route still sees a flash at launch, a native background at window
  creation is the fix, recorded as a CR, not absorbed.
- **`localStorage` under `tauri://localhost`.** Persistence in the bundle is
  proven only by the bundle, so the route launches the built app twice and
  records the origin; if it does not persist, that is a stop.
- **Restyling that changes behavior by accident.** Every US1 test stays
  green on roles and text; a test that needs changing is a stop.

## Validation Route

- **Automated**, in the [test guide](test-guide.md): the chained gate
  (typecheck, test, build, `git diff --check`), `cargo check` for the
  capabilities file, the theme and stylesheet tests above, three shuffled
  runs of the desktop project.
- **Navigator, at the checkpoint (R1)**: `npm run dev`, Appearance to dark,
  a Journey with a short conversation, beside a Pi window in iTerm: face,
  weight, colors, the 16 px size (D4), the 72 ch measure (D6).
- **Navigator, at validation**, in the real app:
  1. With the OS in light and no stored choice, launch: the first frame is
     light, no dark flash; with the OS in dark: dark.
  2. The control cycles system → dark → light → system; each applies at
     once, its icon shows the choice, the traffic lights follow.
  3. With system chosen, flip the OS appearance: the app follows.
  4. `npm run bundle`, launch the built app, choose dark, quit, launch
     again on a light system: it opens dark. Record the origin.
  5. Dark beside Pi: the same instrument.
  6. Light on its own: every state legible and coherent (muted, dim,
     notice and danger text on the canvas and the sidebar), nothing reading
     as the starter kit.
  7. Both themes, every state US1 built: sidebar listed, empty, failed; no
     project path; host unreachable; sign-in; opening, open, failed open; a
     toast. The working glyph pulses, never a label; no spinner, no accent
     dot.
  8. The current row's bold and the title at 16 px read as emphasis; the
     Navigator's own Journey names fit the sidebar.
- **Pass:** every check and observation holds. **Fail:** any one does not.

E2E decision: required. This story is validated on look; the fake host
proves the lifecycle, only the window proves the look, the pre-paint and
the bundle's persistence.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.TS2`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
- Colors and type come from the tokens; a test holds every class to them.
- Carried values are Pi's, converted with Pi's code; derived values name
  their rule.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- a US1 test needs changing to stay green
- the pre-paint needs Rust to change
- Monaco cannot be made to read at the sidebar's size with one token change
- `localStorage` does not survive a relaunch of the built app
- the Navigator's checkpoint read (R1) says the transcript is not it

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
