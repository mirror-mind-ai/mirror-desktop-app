import { describe, expect, it } from "vitest";

import { fixtureNames, loadTurn, parseTurn, turnFromSource } from "./turns.ts";

const plainTurn = () => [
  { type: "agent_start" },
  { type: "message_start", role: "user" },
  { type: "message_end", role: "user", text: "Hello" },
  { type: "message_start", role: "assistant" },
  { type: "text_delta", delta: "Tides " },
  { type: "text_delta", delta: "turn\n" },
  { type: "text_delta", delta: "slowly." },
  { type: "message_end", role: "assistant", text: "Tides turn\nslowly.", stopReason: "stop" },
  { type: "agent_end" },
  { type: "agent_settled", aborted: false },
];

/** The plain turn with one event replaced, inserted or removed. */
function edited(change: (events: Record<string, unknown>[]) => void): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = plainTurn();
  change(events);
  return events;
}

describe("a turn", () => {
  it("is read as the session events it lists", () => {
    expect(parseTurn("plain.json", plainTurn())).toEqual(plainTurn());
  });

  it("is a list", () => {
    expect(() => parseTurn("plain.json", { events: [] })).toThrow("plain.json: a turn is a JSON list of session events");
  });

  it("fails naming the file, the event and the field the protocol does not accept", () => {
    const events = edited((list) => {
      list[5] = { type: "text_deltaa", delta: "turn\n" };
    });
    expect(() => parseTurn("plain.json", events)).toThrow(/^plain\.json: event 5 \(text_deltaa\): .+/);
    const missing = edited((list) => {
      list[7] = { type: "message_end", role: "assistant", stopReason: "stop" };
    });
    expect(() => parseTurn("plain.json", missing)).toThrow(/^plain\.json: event 7 \(message_end\): text: .+/);
  });

  it("refuses a field the protocol does not describe, which a parse alone would strip", () => {
    const events = edited((list) => {
      list[4] = { type: "text_delta", delta: "Tides ", usage: { input: 12 } };
    });
    expect(() => parseTurn("plain.json", events)).toThrow('plain.json: event 4 (text_delta): unknown field "usage"');
  });

  it("starts with agent_start and ends with agent_settled", () => {
    expect(() => parseTurn("plain.json", plainTurn().slice(1))).toThrow(
      "plain.json: event 0 (message_start): a turn starts with agent_start",
    );
    expect(() => parseTurn("plain.json", plainTurn().slice(0, -1))).toThrow(
      "plain.json: event 8 (agent_end): a turn ends with agent_settled",
    );
  });

  it("keeps its deltas inside an assistant message", () => {
    const events = edited((list) => {
      list.splice(2, 0, { type: "text_delta", delta: "stray" });
    });
    expect(() => parseTurn("plain.json", events)).toThrow(
      "plain.json: event 2 (text_delta): a delta outside an assistant message",
    );
  });

  it("ends an assistant message with the text its deltas streamed", () => {
    const events = edited((list) => {
      list[7] = { type: "message_end", role: "assistant", text: "Tides turn slowly.", stopReason: "stop" };
    });
    expect(() => parseTurn("plain.json", events)).toThrow(
      "plain.json: event 7 (message_end): its text is not the joined text deltas",
    );
  });

  it("closes every message it opens", () => {
    expect(() => parseTurn("plain.json", edited((list) => list.splice(7, 1)))).toThrow(
      "plain.json: event 7 (agent_end): the assistant message opened at event 3 is still open",
    );
  });

  it("carries invented content only: no real home directory, nothing shaped like a secret", () => {
    const withText = (text: string) =>
      edited((list) => {
        list[2] = { type: "message_end", role: "user", text };
      });
    expect(() => parseTurn("plain.json", withText("see /Users/test/notes.md"))).not.toThrow();
    const refused: [string, string][] = [
      ["read /Users/vinicius/.env", "a home directory other than /Users/test/"],
      ["read /home/someone/.ssh", "a home directory other than /Users/test/"],
      ["key sk-ant-api03-abcdefghij", "a secret-shaped string"],
      ["token ghp_abcdefghijklmnopqrstuvwxyz0123", "a secret-shaped string"],
      ["id AKIAABCDEFGHIJKLMNOP", "a secret-shaped string"],
      ["jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT", "a secret-shaped string"],
      ["-----BEGIN OPENSSH PRIVATE KEY-----", "a secret-shaped string"],
    ];
    for (const [text, problem] of refused) {
      expect(() => parseTurn("plain.json", withText(text)), text).toThrow(`plain.json: event 2 (message_end): ${problem}`);
    }
  });
});

describe("a fixture file", () => {
  it("fails naming the file when it is not JSON", () => {
    expect(() => turnFromSource("broken.json", "[{")).toThrow(/^broken\.json is not JSON: /);
  });

  it("is loaded by name and fails naming the fixtures there are when it does not exist", () => {
    expect(() => loadTurn("no-such-turn")).toThrow(/^There is no fixture no-such-turn\.json\. Fixtures: /);
  });

  it("is checked even when no test uses it", () => {
    for (const name of fixtureNames()) expect(() => loadTurn(name), name).not.toThrow();
  });
});
