import { describe, expect, it } from "vitest";

import { ClientRequest, HostEvent, HostMessage, HostResponse, PROTOCOL_VERSION } from "./index.ts";

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

  it("rejects an empty prompt and an open with neither a Journey nor a directory", () => {
    expect(() => ClientRequest.parse({ id: "r", request: { type: "session.prompt", sessionId: "s1", text: "" } })).toThrow();
    expect(() => ClientRequest.parse({ id: "r", request: { type: "session.open" } })).toThrow();
    expect(ClientRequest.parse({ id: "r", request: { type: "session.open", journey: "mirror-desktop" } }).request.type).toBe(
      "session.open",
    );
  });

  it("lists Journeys with an optional project path", () => {
    const result = HostResponse.parse({
      id: "r",
      result: {
        type: "journeys.list",
        journeys: [
          { id: "mirror-desktop", name: "Mirror Desktop", status: "active", description: "…", projectPath: "/p", parent: "mirror" },
          { id: "finances", name: "Finances", status: "active", description: "" },
        ],
      },
    });
    expect(result.result?.type).toBe("journeys.list");
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

describe("auth protocol", () => {
  it("carries a sign-in flow: a prompt to answer, events to show, and the answer", () => {
    const prompt = HostEvent.parse({
      type: "auth.prompt",
      providerId: "anthropic",
      promptId: "p1",
      prompt: { type: "select", message: "How?", options: [{ id: "browser", label: "Browser" }] },
    });
    expect(prompt.type).toBe("auth.prompt");
    const url = HostEvent.parse({
      type: "auth.event",
      providerId: "anthropic",
      event: { type: "auth_url", url: "https://claude.ai/oauth/authorize?x=1", instructions: "Finish in the browser." },
    });
    expect(url.type).toBe("auth.event");
    expect(ClientRequest.parse({ id: "r", request: { type: "auth.answer", promptId: "p1", value: "browser" } }).request.type).toBe(
      "auth.answer",
    );
    expect(HostEvent.parse({ type: "auth.prompt_closed", promptId: "p1" }).type).toBe("auth.prompt_closed");
  });

  it("describes a provider by its sign-in methods and current state", () => {
    const result = HostResponse.parse({
      id: "r",
      result: {
        type: "auth.providers",
        providers: [
          {
            id: "anthropic",
            name: "Anthropic",
            oauth: { label: "Anthropic (Claude Pro/Max)", subscription: true },
            apiKey: { label: "Anthropic API key" },
            signedIn: { authType: "oauth", source: "OAuth" },
          },
          { id: "openai", name: "OpenAI", apiKey: { label: "OpenAI API key" } },
        ],
      },
    });
    expect(result.result?.type).toBe("auth.providers");
  });

  it("rejects an unknown auth type", () => {
    expect(() =>
      ClientRequest.parse({ id: "r", request: { type: "auth.login", providerId: "anthropic", authType: "password" } }),
    ).toThrow();
  });
});
