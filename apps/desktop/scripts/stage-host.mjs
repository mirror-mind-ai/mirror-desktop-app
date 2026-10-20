#!/usr/bin/env node
// Stage the host for bundling: `src-tauri/resources/host/`.
//
// The host runs as TypeScript on the embedded Node with no build step, so
// what ships is its sources plus a production `node_modules` — Pi's SDK,
// the Mirror core, `ws`, `zod` and the protocol package — installed fresh
// into the staging directory with `--omit=dev --ignore-scripts`, the way Kia
// Desktop vendors its npm packages. The protocol package is copied, not
// linked: a symlink pointing outside the bundle breaks code signing.
//
// Versions come from packages/host/package.json, so the bundle ships exactly
// what development ran against. The staging directory is build output
// (gitignored) and is rebuilt from scratch on every run.

import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const hostRoot = join(repoRoot, "packages", "host");
const protocolRoot = join(repoRoot, "packages", "protocol");
const stageRoot = join(here, "..", "src-tauri", "resources", "host");

async function main() {
  const hostPackage = JSON.parse(await readFile(join(hostRoot, "package.json"), "utf8"));
  const protocolPackage = JSON.parse(await readFile(join(protocolRoot, "package.json"), "utf8"));

  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });
  await cp(join(hostRoot, "src"), join(stageRoot, "src"), { recursive: true });

  // The workspace dependency is replaced by a copy below; everything else is
  // installed from the registry at the versions development used.
  const dependencies = { ...hostPackage.dependencies, ...protocolPackage.dependencies };
  delete dependencies["@mirror-desktop/protocol"];
  await writeFile(
    join(stageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "mirror-desktop-host",
        private: true,
        type: "module",
        version: hostPackage.version,
        dependencies,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`installing host dependencies into ${stageRoot}`);
  execFileSync("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], {
    cwd: stageRoot,
    stdio: "inherit",
  });

  const protocolDest = join(stageRoot, "node_modules", "@mirror-desktop", "protocol");
  await mkdir(dirname(protocolDest), { recursive: true });
  await cp(join(protocolRoot, "src"), join(protocolDest, "src"), { recursive: true });
  await cp(join(protocolRoot, "package.json"), join(protocolDest, "package.json"));

  const size = execFileSync("du", ["-sh", stageRoot], { encoding: "utf8" }).split("\t")[0];
  console.log(`host staged (${size})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
