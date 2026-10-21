// The network guard: no UI test reaches the network.
//
// The UI has one sanctioned way out, the WebSocket to the fake host (see
// fakeSocket.ts). Every other door a webview has is closed: fetch,
// XMLHttpRequest, EventSource, navigator.sendBeacon, and happy-dom's own loader
// beneath them. Each attempt is recorded by URL, so it fails the test even when
// the UI caught the error. The page address cannot resolve
// (`http://mirror.invalid/`, in the Vitest config), so anything that slips past
// fails rather than finding a live server.

import { vi } from "vitest";

import { FakeSocket } from "./fakeSocket.ts";
import { log } from "./traffic.ts";
import { record } from "./violations.ts";

function blocked(door: string, url: string): void {
  record("network", `${door} ${url}`);
  log(`network ${door} ${url} blocked`);
}

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null && "url" in input) return String((input as { url: unknown }).url);
  return String(input);
}

class BlockedXMLHttpRequest extends EventTarget {
  #url = "";
  open(_method: string, url: string | URL): void {
    this.#url = urlOf(url);
    blocked("XMLHttpRequest", this.#url);
  }
  setRequestHeader(): void {}
  abort(): void {}
  send(): void {
    throw new DOMException(`The fake host closes the network in UI tests: ${this.#url}`, "NetworkError");
  }
}

class BlockedEventSource extends EventTarget {
  constructor(url: string | URL) {
    super();
    blocked("EventSource", urlOf(url));
    throw new DOMException("The fake host closes the network in UI tests.", "SecurityError");
  }
}

interface HappyDomWindow {
  happyDOM?: { settings: { fetch: { interceptor: unknown } } };
}

/** Close every door but the fake host's socket. Owned by the UI setup, once per test. */
export function installNetworkGuard(): void {
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = urlOf(input);
    blocked("fetch", url);
    return Promise.reject(new TypeError(`The fake host closes the network in UI tests: fetch ${url}`));
  });
  vi.stubGlobal("XMLHttpRequest", BlockedXMLHttpRequest);
  vi.stubGlobal("EventSource", BlockedEventSource);
  vi.spyOn(navigator, "sendBeacon").mockImplementation((url) => {
    blocked("sendBeacon", urlOf(url));
    return false;
  });
  // Beneath the globals: what happy-dom itself would load (a stylesheet, an
  // image, an iframe) goes through its own fetch, which the stubs above never see.
  const settings = (window as unknown as HappyDomWindow).happyDOM?.settings;
  if (settings) {
    settings.fetch.interceptor = {
      beforeAsyncRequest: async ({ request }: { request: { url: string } }) => {
        blocked("happy-dom load", request.url);
        return new Response(null, { status: 503, statusText: "Blocked by the fake host" });
      },
    };
  }
}

/** Reopen happy-dom's own loader; the stubs are restored with every other global. */
export function removeNetworkGuard(): void {
  const settings = (window as unknown as HappyDomWindow).happyDOM?.settings;
  if (settings) settings.fetch.interceptor = null;
}
