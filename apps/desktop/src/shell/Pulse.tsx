/**
 * The app's one motion: a small muted dot pulsing slowly, for "working" beside
 * a Journey and "still streaming" in the transcript. It is decoration; the
 * state it shows is always also said in words or ARIA. It never pulses a
 * label, and under reduced motion it stands still at full strength.
 */
export function Pulse() {
  return <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-muted animate-pulse-quiet motion-reduce:animate-none" />;
}
