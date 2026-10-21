import { describe, expect, it } from "vitest";

import { registeredStores, resetAllStores } from "./registry.ts";

// Every store the app has: one `store.ts` per concern folder. Importing them
// is what registers them, so a store that forgot to register is caught here,
// before it leaks one test's state into the next.
const STORE_MODULES = import.meta.glob("../*/store.ts", { eager: true });

describe("the store registry", () => {
  it("finds the stores, so the checks below cannot pass on nothing", () => {
    expect(Object.keys(STORE_MODULES).length).toBeGreaterThanOrEqual(3);
  });

  it("knows every store, by the name of its folder", () => {
    const folders = Object.keys(STORE_MODULES)
      .map((path) => path.split("/")[1] ?? path)
      .sort();
    expect(registeredStores().map((store) => store.name)).toEqual(folders);
  });

  it("returns every store to where it started", () => {
    const started = registeredStores().map((store) => store.api.getState());
    // A key no store has, so a reset that merged instead of replacing would leave it behind.
    for (const store of registeredStores()) store.api.setState({ changedByTheTest: true } as never);
    resetAllStores();
    expect(registeredStores().map((store) => store.api.getState())).toEqual(started);
  });
});
