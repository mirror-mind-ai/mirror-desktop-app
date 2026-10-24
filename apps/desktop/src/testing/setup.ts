// The UI test setup: every desktop test runs inside it.
//
// It owns every global the harness touches, installs it for each test, and
// tears it down in one fixed order, so a test that passes alone also passes in
// a file of others:
//
//   1. unmount the app (App's effects close its connection and stop following
//      the system's appearance);
//   2. put the theme's ambient state back (stored choice, the class on <html>,
//      the system's appearance), now that nothing listens to it;
//   3. drop every frame still queued, so a turn still playing delivers nothing
//      to the next test;
//   4. fail on what was recorded: violations, turns never played, and any
//      console.error (React's act() warnings included: they are how a late
//      update shows itself);
//   5. remove the IPC mocks;
//   6. restore every stubbed global.
//
// When a test fails, the fake host's traffic log is printed after it, so a
// failure that broke no rule still says what crossed the socket.

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { resetAppearance } from "./appearance.ts";
import { endFakeHosts } from "./fakeHost.ts";
import { resetSockets } from "./fakeSocket.ts";
import { closeIpcDoor, openIpcDoor } from "./ipcDoor.ts";
import { installNetworkGuard, removeNetworkGuard } from "./networkGuard.ts";
import { takeLog } from "./traffic.ts";
import { verify } from "./violations.ts";

let consoleErrors: string[] = [];

beforeEach((context) => {
  takeLog();
  installNetworkGuard();
  openIpcDoor();
  // Each test gets its own empty localStorage, a happy-dom Storage. Node 25 and
  // later define a global localStorage of their own, undefined without
  // --localstorage-file, which hides happy-dom's; stubbing it keeps the app's
  // storage the same on every Node from the floor up.
  vi.stubGlobal("localStorage", new Storage());
  consoleErrors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "));
  });
  context.onTestFailed(() => {
    const traffic = takeLog();
    if (traffic.length > 0) console.log(`The fake host's traffic, in order:\n  ${traffic.join("\n  ")}`);
  });
});

afterEach(() => {
  const failures: string[] = [];
  try {
    cleanup();
    resetAppearance();
    resetSockets();
    endFakeHosts();
    try {
      verify();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    if (consoleErrors.length > 0) {
      failures.push(`console.error was called ${consoleErrors.length} time(s):\n  - ${consoleErrors.join("\n  - ")}`);
    }
  } finally {
    closeIpcDoor();
    removeNetworkGuard();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
});
