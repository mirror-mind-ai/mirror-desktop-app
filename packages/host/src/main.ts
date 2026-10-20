// Entry point of the Mirror Desktop host. Two steps, in this order:
//
// 1. make the Mirror core loadable from node_modules (a load hook, see
//    mirrorLoader.ts) and keep Node's experimental-feature warnings off the
//    shell's log — `node:sqlite`, `registerHooks` and type stripping are all
//    experimental in the Node 24 floor, as they are for the Mirror core;
// 2. import the server dynamically, so that the hook is in place before the
//    core's module graph is loaded.

import { registerMirrorTypeStripping } from "./mirrorLoader.ts";

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return;
  process.stderr.write(`${warning.name}: ${warning.message}\n`);
});

registerMirrorTypeStripping();

await import("./server.ts");
