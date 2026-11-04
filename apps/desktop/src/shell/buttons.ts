/**
 * The accent button: the one action that moves a screen forward (Send, a
 * provider's sign-in, Continue). Callers add their padding.
 *
 * Disabled, it keeps its shape on any ground, as every disabled button in the
 * app does: a hairline outline, dim text, no fill. A disabled fill in a ground
 * color vanished on sign-in's raised cards (TS2's debt review), so the rule
 * lives here once rather than in each button.
 */
export const ACCENT_BUTTON =
  "flex items-center gap-2 rounded-control border border-transparent bg-accent text-ui text-on-accent disabled:border-hairline disabled:bg-transparent disabled:text-dim";

/**
 * The plain button: an action beside the accent one (Follow up, Stop), on a
 * hairline. Disabled, it keeps the same outline with dim text. Callers add
 * their padding.
 */
export const PLAIN_BUTTON =
  "flex items-center gap-2 rounded-control border border-hairline text-ui text-ink hover:bg-hover disabled:text-dim disabled:hover:bg-transparent";
