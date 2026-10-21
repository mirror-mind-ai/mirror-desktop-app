import { describe, expect, it } from "vitest";

// The app's own sources: everything under src/ except tests and this harness.
const APP_SOURCES = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}", "!./**"], {
  eager: true,
  query: "?raw",
  import: "default",
});

/** What the app may never import: the harness, and the libraries only tests use. */
const TEST_ONLY = [
  /(^|\/)testing\//,
  /^@testing-library\//,
  /^@tauri-apps\/api\/mocks$/,
  /^happy-dom$/,
  /^vitest(\/|$)/,
];

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

describe("the harness boundary", () => {
  it("reads the app's sources, so the check below cannot pass on nothing", () => {
    expect(Object.keys(APP_SOURCES)).toEqual(expect.arrayContaining(["../App.tsx", "../main.tsx", "../host/client.ts"]));
  });

  it("never lets app code import the harness or a test-only library", () => {
    const leaks = Object.entries(APP_SOURCES).flatMap(([file, source]) =>
      importsOf(source)
        .filter((specifier) => TEST_ONLY.some((pattern) => pattern.test(specifier)))
        .map((specifier) => `${file} imports ${specifier}`),
    );
    expect(leaks).toEqual([]);
  });
});
