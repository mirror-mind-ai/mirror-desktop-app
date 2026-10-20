// What the agent's children find on their PATH.
//
// Inside the bundle there is no `node` and no `mirror` on the machine's PATH
// — that is the point of embedding the runtime. But three things Pi spawns
// expect them: Mirror's logger extension runs `node <mirror-mind/bin/mirror.js>`,
// Mirror's skills tell the model to run `mirror …` through the bash tool,
// and a user's own scripts may call `node`. So before any session opens, the
// host materializes a small bin directory and prepends it to its own PATH,
// which every child inherits:
//
//   node    → a symlink to the very binary running this host (the embedded
//             `mirror-node` in a bundle, the system node in development)
//   mirror  → a shim running the bundled Mirror core's own bin
//
// The desktop therefore always uses ITS Mirror, in development too, rather
// than whatever `mirror` the shell has; the version the About screen shows
// is the version the skills run.

import { chmodSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIRROR_BIN = fileURLToPath(import.meta.resolve("mirror-mind/bin/mirror.js"));

/** Where the shims live: the directory the shell names, else a per-user temp location. */
export function runtimeBinDir(): string {
  return process.env.MIRROR_DESKTOP_RUNTIME_DIR ?? join(tmpdir(), "mirror-desktop", "bin");
}

export function materializeRuntimeBin(dir = runtimeBinDir()): string {
  mkdirSync(dir, { recursive: true });

  const nodeLink = join(dir, "node");
  if (currentLinkTarget(nodeLink) !== process.execPath) {
    rmSync(nodeLink, { force: true });
    symlinkSync(process.execPath, nodeLink);
  }

  const mirrorShim = join(dir, "mirror");
  writeFileSync(mirrorShim, `#!/bin/sh\nexec "${nodeLink}" "${MIRROR_BIN}" "$@"\n`);
  chmodSync(mirrorShim, 0o755);

  const delimiter = process.platform === "win32" ? ";" : ":";
  const path = process.env.PATH ?? "";
  if (!path.split(delimiter).includes(dir)) process.env.PATH = path ? `${dir}${delimiter}${path}` : dir;
  return dir;
}

function currentLinkTarget(path: string): string | undefined {
  try {
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}
