/**
 * A path as a person reads it, with their home directory shown as `~`.
 *
 * The UI does not know the person's home directory: the host does, and
 * carrying it would be a protocol change. On macOS every `/Users/<name>` is a
 * home except `/Users/Shared`, so that is the rule until the host says. Its
 * known limit: another person's home on the same Mac reads as `~` too.
 */
export function shortenHome(path: string): string {
  const home = /^\/Users\/([^/]+)(?=\/|$)/.exec(path);
  if (!home || home[1] === "Shared") return path;
  return `~${path.slice(home[0].length)}`;
}
