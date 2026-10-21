import { defineConfig } from "vitest/config";

// One runner, two projects, split by workspace: a test runs where its code
// runs. Packages run in node. Every desktop test runs in happy-dom on the
// app's own Vite config, with the harness setup that keeps it away from Pi,
// models and the network (CV1.DS1.TS1). Tests live beside the code they
// prove; run them from the repository root.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/**/src/**/*.test.ts"],
          environment: "node",
          retry: 0,
        },
      },
      {
        extends: "./apps/desktop/vite.config.ts",
        root: "./apps/desktop",
        test: {
          name: "desktop",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "happy-dom",
          environmentOptions: {
            happyDOM: {
              // A page address that can never resolve: a request that slips
              // past the guard fails instead of finding a live server.
              url: "http://mirror.invalid/",
              // The posture is stated, not inherited from defaults: rendered
              // content never runs, and nothing loads or navigates.
              settings: {
                enableJavaScriptEvaluation: false,
                disableJavaScriptFileLoading: true,
                enableCSSFileLoading: false,
                enableImageFileLoading: false,
                enableIframePageLoading: false,
                enableFileSystemHttpRequests: false,
                navigation: {
                  disableMainFrameNavigation: true,
                  disableChildFrameNavigation: true,
                  disableChildPageNavigation: true,
                  disableFallbackToSetURL: true,
                },
              },
            },
          },
          setupFiles: ["./src/testing/setup.ts"],
          retry: 0,
          env: { DEBUG_PRINT_LIMIT: "20000" },
        },
      },
    ],
  },
});
