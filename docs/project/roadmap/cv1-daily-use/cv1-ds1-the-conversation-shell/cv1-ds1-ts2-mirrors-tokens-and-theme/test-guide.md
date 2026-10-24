[< Story](index.md)

# Test Guide — CV1.DS1.TS2 Mirror's tokens and theme

## Automated Validation

From the repository root:

```bash
# The gate, chained: every step must pass.
npm run typecheck && npm test && npm run build && git diff --check

# The capabilities file grew two window permissions.
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# The theme's tests alone, and the stylesheet's.
npx vitest run apps/desktop/src/theme apps/desktop/src/shell/Appearance.test.tsx apps/desktop/src/styles apps/desktop/src/testing/tokenScan.test.ts --project desktop

# Ambient theme state never leaks: three shuffled runs of the desktop project.
for seed in 1 2 3; do npx vitest run --project desktop --sequence.shuffle --sequence.seed=$seed || break; done
```

Expected:

- typecheck, every test, the build and the diff check pass;
- the theme tests cover resolution, the store, boot and sync on an injected
  environment, and the UI: launch on a light system, relaunch after dark,
  the control's cycle, the OS flip under `system`, re-following after an
  explicit choice, an unknown stored value, and no leak into the next test;
- the stylesheet test finds every `@theme` color overridden in `.light`
  and nothing else, and both canvases equal to the window's;
- the scanner's self-test catches `text-red-400`, `bg-card`, `text-sm` and
  an arbitrary color, and the scan of the app's sources finds nothing;
- every US1 test passes unchanged.

## Navigator Validation

**At the checkpoint (R1)**, before the rest of the chrome is restyled:

1. `npm run dev`. Choose dark with the appearance control in the sidebar
   footer.
2. Open a Journey with a short conversation, a few turns, a tool call if
   one comes.
3. Put a Pi window in iTerm beside it.
4. **Observe:** the transcript and composer in Monaco, Pi's ink and muted
   on the terminal's ground, Pi's violet on Send, the 16 px reading size
   (D4) and the 72 ch measure (D6).
5. **Pass:** it reads as the same instrument. **Fail:** anything reads
   foreign; name it, and the rest waits.

**At validation**, in the real app:

1. With the OS in light and nothing chosen, launch: the first frame is
   light, no dark flash. With the OS in dark: dark, no light flash.
2. The control cycles system → dark → light → system: each step applies at
   once, the icon shows the choice, the traffic lights follow.
3. With system chosen, switch the OS appearance in System Settings: the app
   follows.
4. The bundle is built (2026-10-24, ad-hoc signed):
   `apps/desktop/src-tauri/target/release/bundle/macos/Mirror Desktop.app`.
   Launch it, choose dark, quit, launch again with the OS in light: it
   opens dark. (To rebuild: `npm run bundle --workspace apps/desktop`.) The
   bundle serves the UI from `tauri://localhost` and `npm run dev` from
   `http://localhost:1421`: two origins, two storages, so a choice made in
   one is not seen in the other.
5. Dark beside Pi: the face, the weight and the ground, as at the
   checkpoint. The colors along the text are not judged here: they come
   with US2's Markdown.
6. Light on its own: every state legible and coherent; muted, dim, notice
   and danger text read on the canvas and on the sidebar; the warm canvas,
   blue selection and violet accent hold together.
7. Both themes, every state US1 built: sidebar listed, empty, failed; a
   Journey without a project path; host unreachable; sign-in; opening, open,
   failed open; a toast. The working glyph pulses, never a label; no
   spinner, no accent dot.
8. The current row's bold and the 16 px title read as emphasis; your own
   Journey names fit the sidebar.

**Pass:** every step holds. **Fail:** any one does not; say which, and
what you saw.

## Validation Evidence

**Checkpoint (R1), 2026-10-24.** The Navigator ran the app (`npm run dev`)
on a real Journey in both themes and read the dark transcript beside Pi in
iTerm. The face passes. The text read monochrome next to Pi's: Pi colors
its Markdown (headings, inline code, list markers, links, code blocks),
and the transcript still printed Markdown as source. Ruling: Markdown in
Pi's colors stays in CV1.DS1.US2, captured in its index; this story
continues.

**Automated, 2026-10-24.** `npm run typecheck && npm test && npm run build
&& git diff --check`: green, 189 tests (12 node, 177 desktop); `cargo check`
green with the two window permissions; the desktop project green under
shuffle seeds 1, 2 and 3; `npm run bundle` built the `.app` and the `.dmg`
in 1 min 28 s. The scanner's self-test catches what it should, and the scan
of the app's sources finds nothing; every US1 test passed unchanged.

**Navigator, 2026-10-24: accepted.** The Navigator ran the route in the
real app and accepted it, with nine captures:

- dark beside Pi in iTerm on a real conversation: the face, the weight and
  the ground read as Pi's; the answer's Markdown table shows as source, which
  is US2's;
- Flip, without a project path, in both themes: the reason, the `set-path`
  command and Refresh, no composer;
- the sign-in panel, and an API-key flow with the pulse beside its title, in
  both themes;
- "Sign-in cancelled." as a toast at the top right, below the header, on
  the raised ground with the danger icon, in both themes;
- the hover overlay on rows over both sidebars, the selection fill and bold
  on the current row, and "Mirror TypeScript Core Port" whole in the
  288 px sidebar.

The launch, the control's cycle, the OS following and the relaunch were
accepted without captures. Not manually verified, accepted on their UI
tests and the token scan: the sidebar empty and failed, host unreachable,
and a failed open. The captures show two flaws in sign-in, taken to Debt
Review.

**After the debt payment, 2026-10-24.** `npm run typecheck && npm test &&
npm run build && git diff --check`: green, 191 tests (12 node, 179
desktop), the two new ones holding the toasts' override to the names sonner
declares, shown red by renaming one in `app.css`; the desktop project green
under shuffle seeds 1, 2 and 3; the bundle rebuilt.

**The payment, seen by the Navigator, 2026-10-24.** Nine captures, both
themes: Anthropic's and GitHub Copilot's rows keep their status on one line
and put their buttons on a second; during an API-key flow and a select
prompt, the OAuth buttons and Continue keep a hairline outline in dim text;
Send is an outline at rest and the violet fill once there is a draft. The
Navigator found nothing else to do in the story.
