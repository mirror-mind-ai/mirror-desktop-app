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
4. `npm run bundle --workspace apps/desktop`, launch the built app, choose
   dark, quit, launch again with the OS in light: it opens dark. Record the
   origin the bundle runs on.
5. Dark beside Pi: the same instrument.
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

Recorded when validation runs.
