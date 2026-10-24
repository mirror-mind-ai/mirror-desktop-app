// Following the stream: the transcript keeps its view at the latest text
// while the person reads there, and holds still once they scroll up to read
// something else. Pure, so the rule is proven without a layout; the
// transcript applies it to its scroll events.

export interface ScrollMetrics {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** How far from the very bottom still counts as the bottom: one line of the transcript. */
const BOTTOM_SLACK_PX = 24;

/** Whether the view shows the end of the transcript, within a line. */
export function isAtBottom({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): boolean {
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_SLACK_PX;
}

/**
 * Whether the view follows after a scroll event. At the bottom it follows.
 * Off it, only a move up stops the following: the event the view's own
 * scroll fires can arrive after a delta has grown the transcript, reading a
 * view off the bottom that nobody moved, and that must not stop it.
 */
export function followsAfterScroll(following: boolean, metrics: ScrollMetrics, previousTop: number): boolean {
  if (isAtBottom(metrics)) return true;
  if (metrics.scrollTop < previousTop) return false;
  return following;
}
