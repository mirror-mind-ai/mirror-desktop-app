/**
 * A session's date as the sessions list shows it: absolute and short, so a
 * date ages honestly down a long list. The month and day ("Oct 29"), and the
 * year when it is not this one ("Oct 29, 2025"), in the person's time zone.
 */
export function sessionDate(time: number, now: number = Date.now()): string {
  const date = new Date(time);
  const thisYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", thisYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
