import { defineConfig } from "vitest/config";

// One runner for every workspace. Tests live beside the code they prove,
// named `*.test.ts`; the desktop app adds React component tests later.
export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.{ts,tsx}"],
    retry: 0,
  },
});
