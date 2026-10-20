// Lets the Mirror core run from node_modules.
//
// The core is TypeScript executed directly by Node, with no build step. Node
// strips types for `.ts` files outside node_modules, but refuses to do so for
// anything under it (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — a policy
// with no flag). Mirror's own bins solve this with a load hook that strips
// types for files under the package root only; this is the host's copy of
// that hook, scoped to the installed `mirror-mind` package and nothing else.
//
// The hook must be registered before the core's module graph is loaded, and
// static imports load before any code runs — so the entry registers it and
// then imports the server dynamically (see main.ts).

import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

/** The installed Mirror package root, as a URL prefix, resolved from its package.json. */
const MIRROR_ROOT = new URL("./", import.meta.resolve("mirror-mind/package.json")).href;

export function registerMirrorTypeStripping(): void {
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith(MIRROR_ROOT) && url.endsWith(".ts")) {
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
