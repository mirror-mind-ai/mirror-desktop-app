import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cssBlock, declarations } from "../testing/tokenScan.ts";

// app.css themes the toasts by overriding variables and attributes that are
// sonner's own, not a public API. An upgrade that renamed them would bring
// sonner's palette back without a sound, and nothing renders CSS in a test, so
// this reads what sonner injects at runtime (its stylesheet travels inside its
// module) for every name the override relies on.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "app.css"), "utf8");
const sonner = readFileSync(createRequire(import.meta.url).resolve("sonner"), "utf8");

const TOASTER = "html [data-sonner-toaster][data-sonner-theme]";

describe("the toasts' override of sonner", () => {
  it("sets only variables that sonner still declares", () => {
    const overridden = [...declarations(cssBlock(css, TOASTER)).keys()].filter((name) => name.startsWith("--"));
    expect(overridden).toEqual(["--normal-bg", "--normal-border", "--normal-text", "--border-radius"]);
    for (const name of overridden) expect(sonner, `sonner no longer declares ${name}`).toContain(`${name}:`);
  });

  it("selects by attributes that sonner still sets", () => {
    for (const attribute of ["data-sonner-toaster", "data-sonner-theme", "data-sonner-toast", "data-type", "data-icon"]) {
      expect(sonner, `sonner no longer sets ${attribute}`).toContain(attribute);
      expect(css, `app.css no longer selects by ${attribute}`).toContain(`[${attribute}`);
    }
  });
});
