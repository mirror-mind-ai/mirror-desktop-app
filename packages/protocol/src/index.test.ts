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

describe("session protocol", () => {
  it("accepts the open/prompt/abort/close requests", () => {
    for (const request of [
      { type: "session.open", cwd: "/tmp/journey" },
      { type: "session.prompt", sessionId: "s1", text: "hello" },
      { type: "session.abort", sessionId: "s1" },
      { type: "session.close", sessionId: "s1" },
    ]) {
      expect(ClientRequest.parse({ id: "r", request }).request.type).toBe(request.type);
    }
  });

  it("rejects an empty prompt and an open without a working directory", () => {
    expect(() => ClientRequest.parse({ id: "r", request: { type: "session.prompt", sessionId: "s1", text: "" } })).toThrow();
    expect(() => ClientRequest.parse({ id: "r", request: { type: "session.open" } })).toThrow();
  });

  it("forwards only the projected session events", () => {
    const envelope = (event: unknown) => ({ type: "session.event", sessionId: "s1", at: 1, event });
    expect(HostMessage.parse(envelope({ type: "text_delta", delta: "po" }))).toMatchObject({ type: "session.event" });
    expect(HostMessage.parse(envelope({ type: "agent_settled", aborted: false }))).toMatchObject({ type: "session.event" });
    expect(
      HostMessage.parse(
        envelope({ type: "tool_end", toolCallId: "c1", toolName: "bash", isError: false, durationMs: 12, resultText: "ok" }),
      ),
    ).toMatchObject({ type: "session.event" });
    // An event Pi emits that nobody wrote down is not part of the contract.
    expect(() => HostMessage.parse(envelope({ type: "turn_start" }))).toThrow();
  });

  it("names the session failures the UI can act on", () => {
    for (const code of ["session_not_found", "session_open_failed", "session_busy"]) {
      expect(HostResponse.parse({ id: "r", error: { code, message: "…" } }).error?.code).toBe(code);
    }
  });
});
