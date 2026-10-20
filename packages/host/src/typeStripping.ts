// Lets TypeScript packages run from node_modules.
//
// The host, the protocol package and the Mirror core are TypeScript executed
// directly by Node, with no build step. Node strips types for `.ts` files
// outside node_modules, but refuses to do so for anything under it
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — a policy with no flag).
// Mirror's own bins solve this with a load hook that strips types for files
// under their package root only; this is the host's copy of that hook,
// scoped to exactly two packages and nothing else:
//
//   mirror-mind               the Mirror core
//   @mirror-desktop/protocol  our own contract — a workspace link in a
//                             checkout, a copy under node_modules in a bundle
//
// The hook must be registered before those module graphs are loaded, and
// static imports load before any code runs — so the entry registers it and
// then imports the server dynamically (see main.ts).

import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const STRIPPED_ROOTS = ["mirror-mind/package.json", "@mirror-desktop/protocol/package.json"].map(
  (packageJson) => new URL("./", import.meta.resolve(packageJson)).href,
);

export function registerTypeStripping(): void {
  registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith(".ts") && STRIPPED_ROOTS.some((root) => url.startsWith(root))) {
        const source = readFileSync(fileURLToPath(url), "utf8");
        return {
          format: "module",
          source: stripTypeScriptTypes(source, { mode: "strip" }),
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
}
