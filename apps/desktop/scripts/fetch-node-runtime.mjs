#!/usr/bin/env node
// Fetch the embedded Node runtime (`mirror-node`) at build time.
//
// A clean machine must run the host with no prerequisite: the app ships its
// own Node 24, as a Tauri sidecar named `mirror-node` (never `node`, so a
// Linux package cannot collide with the system `nodejs` and the process is
// recognizable in `ps`). The approach, and the hard lessons in it, come from
// Kia Desktop's fetch-node-runtime.mjs (D109/D112):
//
//   1. download the OFFICIAL archive from https://nodejs.org/dist/ — pinned
//      host, no mirrors;
//   2. verify its SHA256 against the hashes COMMITTED BELOW before touching it;
//   3. extract ONLY the node binary — npm, npx and corepack do not embark.
//
// It does not sign: the bundler signs the sidecar with the app's identity and
// the shared Entitlements.plist, at the moment that identity is usable.
//
// Destination: `src-tauri/binaries/mirror-node-<target-triple>[.exe]`, the
// `externalBin` naming Tauri expects, declared in `tauri.bundle.conf.json`
// (an overlay, because a base-conf `externalBin` fails every cargo build on a
// checkout that has not fetched it). Idempotent by pinned version + verified
// content, never by mtime: a `.meta.json` beside the binary records what it is.
//
// VERSION BUMP: download SHASUMS256.txt (and its signature) from
// nodejs.org/dist/<version>/, verify, then update NODE_VERSION and the table.
// The hashes below were read from SHASUMS256.txt over HTTPS on 2026-10-20
// and agree with the table Kia Desktop verified with the release keys.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NODE_VERSION = "v24.19.0"; // LTS Krypton

const NODE_ARCHIVE_SHA256 = {
  "darwin-arm64": "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
  "darwin-x64": "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316",
  "linux-arm64": "d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f",
  "linux-x64": "f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4",
  "win-arm64": "8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f",
  "win-x64": "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
};

const TRIPLE_TO_NODE_PLATFORM = {
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "x86_64-unknown-linux-gnu": "linux-x64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-pc-windows-msvc": "win-x64",
  "aarch64-pc-windows-msvc": "win-arm64",
};

const here = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(here, "..", "src-tauri", "binaries");

function hostTriple() {
  const os = { darwin: "apple-darwin", linux: "unknown-linux-gnu", win32: "pc-windows-msvc" }[process.platform];
  const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
  if (!os || !arch) throw new Error(`unsupported host ${process.platform}/${process.arch}`);
  return `${arch}-${os}`;
}

function argTarget() {
  const index = process.argv.indexOf("--target");
  return index === -1 ? undefined : process.argv[index + 1];
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const triple = argTarget() ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? hostTriple();
  const platform = TRIPLE_TO_NODE_PLATFORM[triple];
  if (!platform) throw new Error(`no Node platform for target ${triple}`);
  const expectedSha = NODE_ARCHIVE_SHA256[platform];
  const isWindows = platform.startsWith("win");
  const dest = join(BIN_DIR, `mirror-node-${triple}${isWindows ? ".exe" : ""}`);
  const metaPath = `${dest}.meta.json`;

  if (await exists(dest)) {
    const meta = JSON.parse(await readFile(metaPath, "utf8").catch(() => "{}"));
    if (meta.version === NODE_VERSION && meta.archiveSha256 === expectedSha) {
      console.log(`mirror-node ${NODE_VERSION} for ${triple} already present`);
      return;
    }
  }

  const archiveName = `node-${NODE_VERSION}-${platform}.${isWindows ? "zip" : "tar.gz"}`;
  const url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actualSha = createHash("sha256").update(archive).digest("hex");
  if (actualSha !== expectedSha) {
    throw new Error(`SHA256 mismatch for ${archiveName}: expected ${expectedSha}, got ${actualSha}`);
  }

  const work = join(tmpdir(), `mirror-node-${process.pid}`);
  await mkdir(work, { recursive: true });
  const archivePath = join(work, archiveName);
  await writeFile(archivePath, archive);
  const member = `node-${NODE_VERSION}-${platform}/${isWindows ? "node.exe" : "bin/node"}`;
  if (isWindows) {
    execFileSync("tar", ["-xf", archivePath, "-C", work, member]);
  } else {
    execFileSync("tar", ["-xzf", archivePath, "-C", work, member]);
  }
  await mkdir(BIN_DIR, { recursive: true });
  await rm(dest, { force: true });
  const extracted = join(work, member);
  await writeFile(dest, await readFile(extracted));
  if (!isWindows) await chmod(dest, 0o755);
  await writeFile(metaPath, `${JSON.stringify({ version: NODE_VERSION, triple, archiveSha256: expectedSha }, null, 2)}\n`);
  await rm(work, { recursive: true, force: true });
  console.log(`mirror-node ${NODE_VERSION} for ${triple} ready at ${dest}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
