import { describe, expect, it } from "vitest";

import { ClientRequest, HostMessage, HostResponse, PROTOCOL_VERSION } from "./index.ts";

describe("protocol", () => {
  it("accepts a hello request and its response round-trip", () => {
    const request = ClientRequest.parse({
      id: "1",
      request: { type: "hello", token: "t", protocolVersion: PROTOCOL_VERSION },
    });
    expect(request.request.type).toBe("hello");

    const response = HostResponse.parse({
      id: "1",
      result: {
        type: "hello",
        host: {
          instanceId: "h1",
          protocolVersion: PROTOCOL_VERSION,
          node: "v24.0.0",
          pi: "1.3.0",
          mirror: "0.35.0",
        },
      },
    });
    expect(response.result?.type).toBe("hello");
  });

  it("rejects a request without an id", () => {
    expect(() => ClientRequest.parse({ request: { type: "ping" } })).toThrow();
  });

  it("rejects an unknown request type", () => {
    expect(() => ClientRequest.parse({ id: "2", request: { type: "shutdown" } })).toThrow();
  });

  it("reads host events and responses through one union", () => {
    expect(HostMessage.parse({ type: "host.ready" })).toEqual({ type: "host.ready" });
    const parsed = HostMessage.parse({ id: "3", error: { code: "unauthorized", message: "bad token" } });
    expect("error" in parsed && parsed.error?.code).toBe("unauthorized");
  });
});
