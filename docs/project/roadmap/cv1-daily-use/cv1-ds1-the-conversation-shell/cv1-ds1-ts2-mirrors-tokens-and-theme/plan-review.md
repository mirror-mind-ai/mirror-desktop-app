[< Story](index.md)

# Plan Review — CV1.DS1.TS2

**Date:** 2026-10-24
**Reviewed:** the first version of the plan, as authored in the Plan step (uncommitted at review time), with the story's index.
**Outcome:** the plan was revised and approved with the Navigator's rulings; the current version is [plan.md](plan.md).

## How it was reviewed

Four lenses were chosen for what this plan puts at risk:

- **experience-designer**, because the story is validated on look: a
  reference read from a terminal, a palette carried from Pi's files, a
  type scale, a single motion;
- **engineer**, for the theme's lifecycle: one writer for each effect, the
  store's hydration, the seam between pure resolution and the window;
- **quality-assurance**, for whether the tests prove the launch without a
  flash, the relaunch and the OS following, and whether the scan can fail;
- **product-designer**, for whether the cut serves the Navigator's
  reference: where his eye judges it, what light is judged against.

Security and devops were left out: no dependency, no data, nothing crossing
a boundary beyond two window permissions, which the engineer's lens covers.

Each ran as an isolated reviewer (`pi -p` with the persona's full identity
from Mirror, no tools, no session, nothing logged to Mirror). Each saw the
plan, the story, the repository rules, US1's review rulings, the current
stylesheet and every shell component, the test setup and IPC door, the
Tauri configuration and capabilities, Pi's two theme files resolved to hex
with Pi's own converter, and the Navigator's terminal settings as read from
the machine. The Driver then verified the sharpest claim against the
installed Tauri API: `getCurrentWindow()` reads metadata that only
`mockWindows()` sets, so the engineer's first finding holds.

## Navigator rulings

The Navigator took the Driver's recommendation on every decision and
approved the plan with them.

| Decision | Ruling |
|---|---|
| D1 — the typeface | Monaco everywhere |
| D2 — the hues | Pi's; the index's mint superseded |
| D3 — the canvases | `#1e1e2e` dark, Pi's `#efeeee` light |
| D4 — the reading size | 16 px / 24 px |
| D5 — the appearance control | The cycling button, its icon per state |
| R1 — an early look | A Navigator checkpoint after the tokens, transcript, composer and header, before the rest of the chrome |
| R2 — the measure | 72 ch centered, promoted to D6 |
| R3 — the title | 16 px bold, the body size |
| R4 — the control's visible state | An icon per state; the accessible name stays the test's oracle |
| R5 — the cycle through dark | Kept; a small menu is the recorded fallback |

## The synthesis

**Taken into the plan as defects** (no ruling needed):

1. The story's core sequence was not run by tests: `renderApp()` mirrors
   `main.tsx` but never ran its pre-render apply. One `bootTheme()` is now
   called by both, in the same position (engineer 5, quality-assurance 1).
2. `apply.ts` was called pure while mutating the DOM and crossing into
   Tauri. Split into `resolve.ts`, pure, and `apply.ts`, effectful
   (engineer 4, quality-assurance 2).
3. The window calls need Tauri's window mock in the harness; their promises
   are caught; an OS flip under `system` re-issues both, asserted (engineer
   1, quality-assurance 4).
4. The store was never hydrated and had no single writer: after a relaunch
   the window would open dark while the control said "system". The store
   now holds `preference` and `systemPrefersDark`, derives the resolved
   theme, has pure actions, and one subscriber applies and persists
   (engineer 2, 3, 7).
5. The palette scan was underspecified. It is now an allowlist read from
   `app.css`, over `.ts` and `.tsx`, with a self-test (engineer 6,
   quality-assurance 5).
6. Light had no reference. It is judged on its own coherence, and tuning it
   is expected, not a scope change (experience-designer 2,
   quality-assurance 6, product-designer 2).
7. Hover one step above the canvas vanished on the sidebar; it is an
   overlay (experience-designer 1).
8. The pulse moves a glyph, never a label, which under reduced motion would
   read as disabled (experience-designer 3).
9. Route and stop additions: synthesized bold at 13 and 16 px with a
   fallback (experience-designer 4); the Navigator's Journey names in a
   256 px Monaco sidebar (product-designer 5); a stop if `localStorage` does
   not survive a bundle relaunch (quality-assurance 3); the theme cleanup's
   place in the teardown and one deterministic leak test (quality-assurance
   7); D15 worded "carried from Pi, revisable per role" (product-designer
   6).

**Put to the Navigator** as R1–R5, above.

**Found by the Driver while revising:** happy-dom fires a media list's
`change` only when it re-checks the query on a window `resize`, so a test
flips the OS by changing the setting and dispatching `resize`; and a window
forced dark reports dark to the page's `prefers-color-scheme`, so under
`system` the window is told `null`, not the resolved theme.

## The reviews, as produced

### ◇ experience-designer

**Findings**

1. **The hover token is derived from the canvas but used on the sidebar, where it is invisible in dark.** The slot table derives `--color-hover` as "canvas +4 % L" → `#27273b`, while `--color-sidebar` is "canvas +3 % L" → `#252538`. Sidebar rows (the main hover surface in the app) would show a 1 % lightness step — effectively no hover feedback, which reads as a dead, unresponsive list exactly where the person acts most. In light the same mismatch halves the intended step (`#e9e8e8` on `#f3f2f2`). Change: define hover relative to the surface it sits on (a per-surface rule, or a translucent overlay token applied over any ground), and record that rule in the table; verify both grounds in route step 6.

2. **The two themes are not one world: dark derivations carry Catppuccin's violet, light derivations carry a warm gray.** `#1e1e2e` is OKHSL (284, 29 %, 14 %) — every dark derived surface (sidebar, raised, hairline, hover) inherits a saturated violet cast — while the light canvas `#efeeee` is okhsl hue 17 at ~3 % saturation, so light derivations are warm neutrals, with a cool blue selection (`#dfe7ec`) sitting on them. The story's outcome promises "one product in two lights," but the slot table encodes a violet world and a warm-gray world. This may be acceptable (the dark ground is what the eye knows; the light has no lived reference), but the plan should say so explicitly rather than imply symmetry: add to the derivation rule a sentence naming the hue asymmetry and a route observation for light specifically — does the warm canvas + blue selection + violet accent cohere, or does light need its surfaces nudged toward the dark canvas's hue family?

3. **The pulse is underspecified, and its reduced-motion fallback collides with the dim-means-disabled rule.** Scope 3: "a slow muted pulse (opacity 1 → 0.4 → 1)… Under prefers-reduced-motion the pulse holds at the muted level." Scope 5 says "the working row pulsing in the leading slot" — pulsing *what*? If the Journey name itself pulses, a background stream makes the sidebar flicker ambiently for its whole duration, and under reduced motion the name sits permanently at 0.4 opacity — reading as disabled, the exact state `--color-text-dim` was reserved to mean. Change: pulse a dedicated indicator glyph in the leading slot, never the label; under reduced motion show that indicator static at full muted strength. State this in the plan.

4. **Synthesized bold is the plan's only emphasis mechanism and its rendering in WKWebView is unproven.** Scope 2: "emphasis is bold, synthesized as iTerm synthesizes it (Monaco has one face); the current sidebar row is bold." iTerm's synthesis and WebKit's `font-synthesis` are different renderers; synthetic bold on Monaco at 13–14 px can smear or barely differ from regular. If it fails, both the current-row marker and the `title` role lose their weight cue. The Risks section covers Monaco's *size*, not its *bold*. Change: add synthesized bold at 13 and 14 px to the route (step 5/6) and name the fallback — the selection fill alone marks the current row; `title` separates by size and full-contrast text.

5. **The type scale inverts hierarchy: the screen's heading is smaller than its body.** `title` is 14 / 20 bold (the header's name, state headings) while `body` is 16 / 24 (transcript). In one face and one weight family, the Journey's name — the anchor of the whole conversation area — renders smaller than every transcript line, and only 1 px above the muted facts beside it. Change: either raise `title` to the body size (16 bold) or add a route observation that explicitly judges the header against the transcript; do not let a 1 px step carry the window's most important label.

6. **D5's cycle forces a full-window flash of the unwanted theme.** "Each step applies at once" + cycle order System → Dark → Light means a person on a light system who wants Light must pass through Dark: the whole window, traffic lights included, snaps dark as a mandatory intermediate. For a rarely-touched control that is tolerable but jarring — it reads as a glitch, not a choice. Change: keep the quiet button but note this cost in D5; if the Navigator finds the flash wrong in the route, the fallback is a small menu (not the three-option select), recorded as the alternative.

**Decisions**

- **D1 — Monaco everywhere.** Agree. One face makes the window read as the instrument the reference names; two faces would make the transcript a terminal embedded in a generic app. Contingent on finding 4 (bold) and the 13 px risk already named.
- **D2 — Pi's hues.** Agree. The mint was a placeholder ruling made before the reference was read; a single foreign hue in an otherwise carried palette would be the one thing that reads as "not Pi."
- **D3 — `#1e1e2e`.** Agree — the ground the Navigator's eye calibrated Pi's text and muted values against is the right dark canvas. But accept finding 2's consequence: this choice imports a violet-saturated surface family, and the light theme must be judged on its own in the route.
- **D4 — 16 px.** Agree. A window with a sidebar, header and future Markdown is read as a document, not a terminal line; 18 px body beside 13 px chrome would make the scale feel gapped. The side-by-side route check is the right arbiter.
- **D5 — the cycling button.** Agree with the recommendation as the quieter control, with finding 6's flash noted as the known cost and the menu as the recorded fallback.

Verdict: approve with the changes above.

### ◇ engineer

**Findings**

1. **`getCurrentWindow()` is not reachable through the test door as described.** The plan has `applyTheme` call `getCurrentWindow().setBackgroundColor(...)` / `.setTheme(...)` and says "`renderApp()` scripts the two window commands so every UI test passes the door." But the harness only installs `mockIPC` (`ipcDoor.ts`: `mockIPC`/`clearMocks`); in Tauri v2, `getCurrentWindow()` reads the current-window metadata that `mockWindows()` installs — scripting the commands alone does not make `getCurrentWindow()` resolve in happy-dom. Every UI test would die at the pre-render apply, not just theme tests. Change: either add `mockWindows("main")` to the harness setup (owned by `setup.ts`, like the rest of the door), or — lower coupling — have `applyTheme` take the window as an injected dependency so pure resolution never touches Tauri at all. Verify which before step 1, same as the happy-dom `change` check.

2. **The store is never hydrated from storage — the plan has two sources of truth and no bridge.** The pre-render apply in `main.tsx` "reads the preference" and puts the class on `<html>`; the store starts "from one `initialState`, registered for reset," which per registry rules must be a constant — presumably `system`. Nothing in the plan says how the store's `preference` learns the stored `dark`. Result: relaunch opens dark (class applied) while the control reads "Appearance: system" and one activation sets `dark` → no visible change, a cycle that lies. Change: name the hydration explicitly — `useTheme` (or `main.tsx` after module load) reads the same storage and sets the store before first paint of the control, and a test asserts the control's accessible name matches the stored preference after "relaunch."

3. **Ownership of apply + persist is split across three places with no single writer.** The plan distributes it: actions in `store.ts`, `applyTheme` in `apply.ts`, persistence "on change" somewhere, `useTheme` in `Shell`. Who calls `applyTheme` when `setPreference` runs? Who writes `localStorage`? If it's an effect watching the store, the apply is decoupled from the change and can be missed or doubled (StrictMode mounts twice); if it's inside store actions, store tests now need the DOM and IPC, which the registry rules forbid ("tested against a stub connection, no DOM"). Change: declare one flow in the plan — e.g., actions are pure state transitions; one subscriber (the `useTheme` hook, or a `subscribe` beside the store taking `applyTheme` and `storage` as arguments) is the sole side-effect writer — and test it as such.

4. **`apply.ts` is labeled "pure" but `applyTheme` mutates `<html>` and crosses the Tauri boundary.** This is not a naming nit: the pure parts (`readPreference`, `resolveTheme`) can be tested with no harness at all; `applyTheme` needs the IPC door and DOM. Lumping them in one "pure" module hides the seam and invites the coupling in finding 3. Change: split — `theme/resolve.ts` pure, `theme/apply.ts` effectful — and let `apply.test.ts` cover only resolution without scripting anything.

5. **`renderApp()` must gain the pre-render apply, and the plan doesn't say so.** `Theme.test.tsx` asserts "the pre-render apply leaves `<html>` light before React renders," but tests compose through `renderApp()`, which mirrors `main.tsx` by contract ("when main.tsx gains a provider … this file gains it in the same change"). If the apply lives inline in `main.tsx`, the test proves a tree the app doesn't mount — or the app does something tests never run. Change: the plan names an exported `bootTheme()` (read, resolve, apply, hydrate) that both `main.tsx` and `renderApp()` call; the test asserts through that one function. Also state the error posture: the two window calls are fire-and-forget promises; an unhandled rejection becomes a `console.error` and fails every test at teardown, so they must be awaited-or-caught deliberately.

6. **The palette-class scan is underspecified and will be brittle.** The plan bans "Tailwind palette classes" by example (`text-red-400`, `text-amber-400`, `bg-muted/60`) — but `bg-muted/60` is a token class, not a palette class; the real rule is "only classes over the new token vocabulary." A blocklist regex over `**/*.tsx` misses `.ts` (sonner config), catches `testing/worlds.ts` fixtures the stylesheet already excludes via `@source not`, and silently rots as Tailwind's palette names evolve. Change: specify the scan as an allowlist — color utilities must reference the token names from the slot table — scanning `src/**/*.{ts,tsx}` minus `testing/` and `*.test.*`, with the allowlist derived from `app.css` itself so the two cannot drift (DRY: one source for the vocabulary).

7. **`resolved` stored beside `preference` is derived state.** `resolveTheme(preference, systemPrefersDark)` already computes it; storing both means two fields that can diverge if `followSystem` and `setPreference` don't update in lockstep. Change: store `preference` and `systemPrefersDark`; derive `resolved` with the pure function in a selector. If keeping `resolved` is deliberate (to avoid a `matchMedia` read in the store), say so in the plan and add a test that the pair never disagrees.

**Decisions**

- **D1 — Monaco everywhere**: agree with the recommendation from this lens; one stack collapses `--font-sans`/`--font-display` into one token and removes a class of "wrong face" drift. 
- **D5 — cycle button**: no engineering objection to either; the cycle button is less state to test, provided the accessible name is the oracle (it is, per the acceptance text).

**Verdict**

Revise before approval — findings 1 and 2 would surface as broken tests or a lying control in step 1–2; the rest are one-paragraph plan amendments.

### ◇ quality-assurance

**Findings**

1. **The flash-free launch has no automated ordering proof, and the plan claims it does.** `Theme.test.tsx` says "the pre-render apply leaves `<html>` light before React renders," but tests compose through `renderApp()`, which renders `<App/>` and never executes `main.tsx` — where the plan puts the synchronous apply ("`main.tsx` calls the pre-render apply synchronously before `createRoot(...).render`"). A test that calls `applyTheme` itself and then renders proves the function, not that the app calls it first; the one behavior this story is named for would be proven only by the Navigator's eye. Why it matters: `renderApp.tsx` promises it "mirrors main.tsx" — if the apply lives only in `main.tsx`, every UI test exercises a tree that skips the story's core sequence. Change: extract the pre-render apply into a module both `main.tsx` and `renderApp()` call in the same position, state in the plan that `renderApp()` runs it before `render`, and name what the automated test actually proves (resolution + class) versus what only the route proves (no flash in the real window).

2. **`apply.ts` is called "pure" but issues Tauri commands, and the plan doesn't say how non-UI tests pass the IPC door.** `applyTheme(resolved)` calls `getCurrentWindow().setBackgroundColor(...)` and `setTheme(...)`; the harness fails any test with an unscripted command at teardown (`ipcDoor.ts`). The plan scripts the commands in `renderApp()`, but `theme/apply.test.ts` and `store.test.ts` are described as testing these functions directly — they will hit the door too, or force mocking that drifts from production. Change: split the genuinely pure parts (`readPreference`, `resolveTheme`) from the side-effecting apply, test the pure parts without IPC, and state that every test invoking the apply scripts both commands and asserts arguments (`set_background_color` with the exact canvas hex, `set_theme` with the resolved value).

3. **The persistence risk has no defined failure path.** "Persistence in the bundle is proven only by the bundle" and the route launches the built app twice — correct, that's the only real oracle. But if `localStorage` under the bundle's origin does not persist, the acceptance "survives a relaunch of the built app" fails, the plausible fixes (a store plugin, Rust-side storage) violate "No new dependency" and "the Rust shell's code" non-goals, and no stop condition names it. Why it matters: the Navigator could approve a plan whose central persistence claim has no in-scope remedy. Change: add a stop condition — "localStorage does not survive a bundle relaunch" — routing to a Navigator decision/CR, so the failure is a planned stop, not an improvisation.

4. **With `system` chosen, an OS flip must re-issue the window commands, and the test as written doesn't assert it.** `Theme.test.tsx` says "with `system` chosen, flipping `prefersColorScheme` follows" — follows on `<html>`, but the native chrome and pre-paint only follow if `followSystem` re-runs `applyTheme` and the window gets fresh `set_background_color`/`set_theme` calls. This is exactly the seam (matchMedia listener → store → window IPC) where a class can change while the traffic lights and window ground stay stale. Change: the OS-flip scenario asserts the two commands fire again with the new theme's values, not only the class.

5. **The palette-class scan is underspecified and can pass vacuously forever.** "a scan of `apps/desktop/src/**/*.tsx` for Tailwind palette classes, which must find none" — a green scan proves nothing unless the rule is named (how it distinguishes `text-red-400` from `text-sm` or token classes like `text-danger`) and the scan itself is proven able to catch a violation. It also skips `.ts` files, where class strings can live. Change: define the scan rule in the plan (Tailwind color-name + numeric-shade pattern, plus `bg-muted`-style legacy token names), extend it to `.ts`, and include one self-test that feeds it a known violation and expects a hit.

6. **The light theme has no reference oracle; the acceptance conflates it with the dark comparison.** Acceptance: "When the Navigator reads it beside a Pi window / Then the face is Monaco, the accent is Pi's violet, the ground is the terminal's" — but the Navigator reads Pi only dark on `#1e1e2e` ("Pi's theme setting is fixed to `dark`"; the light canvas is an HTML-export value he has never read). Route step 5 can validate dark; light passes on nothing but step 6's state walk. Why it matters: a light theme that reads wrong would still "pass" every stated check. Change: state explicitly in the route that light is judged on its own criteria (legibility of every US1 state, contrast of muted/dim/notice text on `#efeeee`), and name who judges it — otherwise half of "one product in two lights" ships unvalidated.

7. **Harness cleanup ordering for theme state is asserted but not sequenced against the existing teardown.** Scope 6 adds "clears `localStorage`, strips `dark`/`light` from `<html>`, restores `prefersColorScheme`" to `setup.ts`, whose `afterEach` already has a fixed, commented order ending in `vi.unstubAllGlobals()`. One test "renders twice and asserts a clean `<html>`" covers intra-test leakage, but inter-test leakage (test A chooses dark, test B's pre-render apply reads A's storage) is the real risk the three shuffled runs are meant to catch. Change: name where in the teardown order the theme cleanup sits, and add one explicit two-test pairing (choose dark in one file's first test; assert the next test launches on system) rather than relying on shuffle luck.

**Decisions**

- **D4 (transcript size):** support the recommendation — but the route's side-by-side judgment is dark-only (finding 6); add a light-mode read before ruling final.
- **D5 (appearance control):** accept the cycling button only because its accessible name states the current choice; the test must assert the name after each activation (the name is the only oracle of state for a cycle control). A `select` would be more directly testable, but the stated name closes the gap.
- **D1–D3:** design's call; no QA objection — the stop condition on Monaco at 13 px and the route's both-sizes read cover the testable risk.

Verdict: approve with the changes above.

### ◇ product-designer

**Findings**

1. **The core promise is judged only at the very end of the route.** The story is "validated on look," and the one judgment that matters — route step 5, "Beside a Pi window in iTerm: the transcript's face, weight and colors read as the same instrument" — happens after the entire shell is restyled, the theme machinery built, the bundle produced. If the Navigator's eye says "this is not it" (plausible: the dark theme is a hybrid he has never seen — Pi's `text #dee0e1` carried onto iTerm's `#1e1e2e`, while his terminal's own foreground is Catppuccin's `#cdd6f4`), the whole investment is already spent. **Change:** add a Navigator checkpoint mid-approach — after step 3 plus the transcript and composer only (the surfaces he actually compares with Pi), pause for the side-by-side before restyling the rest. One early "yes, that's it" de-risks everything downstream.

2. **The light theme has no reference and no success criterion.** The Navigator reads Pi only in dark (`~/.pi/agent/settings.json: "theme": "dark"`, background identical in both iTerm variants). The plan carries Pi's light values, but the acceptance "reads as the same instrument" can only be judged in dark; the light theme is something nobody has ever seen or asked for in this form. As written, a Navigator ruling that light needs rework would trip `scope_change_detected`. **Change:** state in the plan that light is judged on its own coherence, not fidelity to a reference, and that adjustments to light values after the route are expected tuning, not scope change.

3. **The appearance control's state is invisible to a sighted person.** D5: "its accessible name states the current choice ('Appearance: system')" — a quiet icon that looks identical in all three states forces the person to click through to discover where they are and what the next click does. A control's current state must be communicated to everyone, not only through the accessibility tree. **Change:** the icon (or a short visible label) changes per state; the acceptance scenario should assert the visible state, not only the name.

4. **The 72 ch centered measure is an undeclared product decision.** Scope item 2 introduces it in passing ("The transcript and composer sit in a measure of 72 ch, centered"), yet it changes how the window reads more than most of the slot table does — and it guarantees divergence from the side-by-side reference, where Pi runs the terminal's full width. It belongs with D1–D5, not buried in a type-roles paragraph. **Change:** promote the measure to a D6 (recommend 72 ch centered; alternative full-width like the terminal) and name it as something route step 5 explicitly judges.

5. **Monaco chrome will truncate Journey names in the fixed sidebar.** `Sidebar.tsx` is `w-64` (256 px) and names `truncate`; Monaco at 13 px yields roughly 28–30 characters per row before padding, noticeably fewer than the current system sans. The risk section covers legibility at 13 px but not whether real Journey names survive the width. **Change:** add to route step 6 a check that the Navigator's actual Journey names read without crippling truncation; note that D1's alternative (sans chrome) remains the one-decision fallback alongside the 14 px token.

6. **D15 "Mirror's look is Pi's" binds Mirror's identity to another product's, permanently phrased.** The objective says "Give the shell Mirror's own look, and make that look Pi's" — fine for now, the Navigator asked for it, but a founding decision worded this way will be cited when US2 and beyond carry `md*`/`syntax*` roles, and later when Mirror wants a face that isn't Pi's. **Change:** record D15 as "Mirror's look is carried from Pi, revisable per role," so a future divergence is a decision, not a contradiction.

**Decisions**

- **D1 — Monaco everywhere.** Agree. The reference named is an instrument, and the product's user is the person who named it; the sans-chrome alternative stays as the cheap revert if finding 5 bites.
- **D2 — Pi's hues.** Agree. The Navigator's spoken reference supersedes the index's mint; one borrowed hue in a Pi palette (the alternative) would serve no one.
- **D3 — `#1e1e2e`.** Agree: it is the ground his eye calibrated every carried dark value against. But see finding 2 — the light canvas is a different kind of choice and should be judged differently.
- **D4 — 16 px.** Agree with the recommendation. This window is a reading surface with chrome and a sidebar, not a full-screen terminal; one step under, with the side-by-side as the tribunal and one token to turn, is the right shape.
- **D5 — the cycle button.** Agree on the cycle over the `select` — this is a rare, set-once preference and deserves no chrome — conditional on finding 3: visible state, not accessible-name-only.

**Verdict**

approve with the changes above
