// The IPC door: the UI's other way out of the webview.
//
// Tauri commands are where strings become actions on the person's machine
// (the opener plugin opens URLs; later, dialogs, the updater and deep links).
// Through `mockIPC`, the door answers only the commands a test scripted
// (`host_endpoint`, when a fake host is served) and records every call with
// its arguments. Anything else is refused and recorded: refusing alone would
// not do, because the UI catches and toasts a rejected command.

import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

import { log } from "./traffic.ts";
import { record } from "./violations.ts";

export interface Invocation {
  readonly command: string;
  readonly args: unknown;
}

const scripts = new Map<string, (args: unknown) => unknown>();
const invocations: Invocation[] = [];

/** Install the door with nothing scripted. Owned by the UI setup, once per test. */
export function openIpcDoor(): void {
  scripts.clear();
  invocations.length = 0;
  mockIPC((command, args) => {
    invocations.push({ command, args });
    const handler = scripts.get(command);
    if (!handler) {
      record("ipc", `${command} ${JSON.stringify(args ?? {})}, which no test scripted`);
      log(`ipc ${command} refused: not scripted`);
      throw new Error(`The fake host has no script for the Tauri command ${command}.`);
    }
    log(`ipc ${command}`);
    return handler(args);
  });
}

/** Answer `command` with `handler` for the rest of the test. */
export function scriptIpc(command: string, handler: (args: unknown) => unknown): void {
  scripts.set(command, handler);
}

/** Every command the UI invoked this test, scripted or not, in order. */
export function ipcInvocations(): readonly Invocation[] {
  return [...invocations];
}

/** Remove the door. Owned by the UI setup, once per test. */
export function closeIpcDoor(): void {
  clearMocks();
  scripts.clear();
  invocations.length = 0;
}
