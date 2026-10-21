// The UI test setup: every desktop test runs inside it.
//
// It owns every global the harness touches, installs it for each test, and
// tears it down in one fixed order, so a test that passes alone also passes in
// a file of others:
//
//   1. unmount the app (App's effect closes its connection);
//   2. drop every frame still queued, so a turn still playing delivers nothing
//      to the next test;
//   3. fail on what was recorded: violations, turns never played, and any
//      console.error (React's act() warnings included: they are how a late
//      update shows itself);
//   4. remove the IPC mocks;
//   5. restore every stubbed global.
//
// When a test fails, the fake host's traffic log is printed after it, so a
// failure that broke no rule still says what crossed the socket.

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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
