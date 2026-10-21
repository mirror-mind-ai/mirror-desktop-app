import { describe, expect, it } from "vitest";

import { FakeSocket } from "./fakeSocket.ts";
import { take } from "./violations.ts";

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("the network guard", () => {
  it("is installed for every desktop test: the only socket is the fake one", () => {
    expect(globalThis.WebSocket).toBe(FakeSocket);
  });

  it("records a fetch even when the caller swallows its failure", async () => {
    await fetch("https://example.com/data").catch(() => undefined);
    expect(take()).toEqual([{ kind: "network", detail: "fetch https://example.com/data" }]);
  });

  it("records an XMLHttpRequest by its URL", () => {
    const request = new XMLHttpRequest();
    request.open("GET", "https://example.com/xhr");
    expect(() => request.send()).toThrow();
    expect(take()).toEqual([{ kind: "network", detail: "XMLHttpRequest https://example.com/xhr" }]);
  });

  it("records an EventSource and a beacon", () => {
    expect(() => new EventSource("https://example.com/events")).toThrow();
    expect(navigator.sendBeacon("https://example.com/beacon", "bye")).toBe(false);
    expect(take()).toEqual([
      { kind: "network", detail: "EventSource https://example.com/events" },
      { kind: "network", detail: "sendBeacon https://example.com/beacon" },
    ]);
  });

  it("records a socket to anything but the fake host", async () => {
    const socket = new WebSocket("ws://127.0.0.1:1421");
    await nextTask();
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(take()).toEqual([{ kind: "socket", detail: expect.stringContaining("ws://127.0.0.1:1421") }]);
  });

  it("never runs a script that rendered content puts on the page", () => {
    const canary = globalThis as { mirrorCanary?: boolean };
    const script = document.createElement("script");
    script.textContent = "globalThis.mirrorCanary = true;";
    document.body.appendChild(script);
    expect(canary.mirrorCanary).toBeUndefined();
    script.remove();
  });
});
