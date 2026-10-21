import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it } from "vitest";

import { ipcInvocations, scriptIpc } from "./ipcDoor.ts";
import { take } from "./violations.ts";

describe("the IPC door", () => {
  it("answers a command a test scripted, and records the call with its arguments", async () => {
    scriptIpc("host_endpoint", () => ({ port: 0, token: "test-token" }));
    await expect(invoke("host_endpoint")).resolves.toEqual({ port: 0, token: "test-token" });
    expect(ipcInvocations()).toEqual([{ command: "host_endpoint", args: {} }]);
  });

  it("refuses a command nobody scripted, and records it even when the caller swallows the refusal", async () => {
    await invoke("plugin:opener|open_url", { url: "https://example.com/" }).catch(() => undefined);
    expect(take()).toEqual([
      { kind: "ipc", detail: expect.stringMatching(/^plugin:opener\|open_url .*https:\/\/example\.com\/.*no test scripted/) },
    ]);
  });
});
