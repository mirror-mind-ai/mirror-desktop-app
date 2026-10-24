import { afterEach, describe, expect, it } from "vitest";

import { FakeSocket, listen, resetSockets, type ServerSide, type SocketPeer, stopListening } from "./fakeSocket.ts";
import { take } from "./violations.ts";

const ENDPOINT = "ws://127.0.0.1:0";
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A server that keeps what it was sent and hands the test its side of each socket. */
function recordingServer() {
  const received: string[] = [];
  const sides: ServerSide[] = [];
  let closed = 0;
  listen(ENDPOINT, {
    accept(side): SocketPeer {
      sides.push(side);
      return {
        receive: (frame) => received.push(frame),
        closed: () => {
          closed += 1;
        },
      };
    },
  });
  return { received, sides, closedCount: () => closed };
}

afterEach(() => {
  resetSockets();
});

describe("the socket double", () => {
  it("opens in a later task, so a listener added after construction hears it", async () => {
    recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    expect(socket.readyState).toBe(FakeSocket.CONNECTING);
    const opened: string[] = [];
    socket.addEventListener("open", () => opened.push("open"), { once: true });
    await nextTask();
    expect(opened).toEqual(["open"]);
    expect(socket.readyState).toBe(FakeSocket.OPEN);
  });

  it("refuses to send while connecting, as a real socket does", () => {
    recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    expect(() => socket.send("{}")).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
  });

  it("carries text frames both ways, delivering the host's one per task as MessageEvents", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    const delivered: unknown[] = [];
    socket.addEventListener("message", (event) => delivered.push((event as MessageEvent).data));
    await nextTask();

    socket.send('{"id":"1"}');
    expect(server.received).toEqual([]);
    await nextTask();
    expect(server.received).toEqual(['{"id":"1"}']);

    server.sides[0]?.send("first");
    server.sides[0]?.send("second");
    await nextTask();
    expect(delivered).toEqual(["first"]);
    await nextTask();
    expect(delivered).toEqual(["first", "second"]);
  });

  it("records a frame that is not text instead of carrying it", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    await nextTask();
    socket.send(new Uint8Array([1, 2, 3]));
    await nextTask();
    expect(server.received).toEqual([]);
    expect(take()).toEqual([{ kind: "protocol", detail: expect.stringMatching(/not text/) }]);
  });

  it("closes the way a real socket does: closing at once, closed and heard later, nothing delivered after", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    const events: string[] = [];
    socket.addEventListener("message", () => events.push("message"));
    socket.addEventListener("close", (event) => events.push(`close ${(event as CloseEvent).code}`));
    await nextTask();

    server.sides[0]?.send("late");
    socket.close();
    expect(socket.readyState).toBe(FakeSocket.CLOSING);
    expect(events).toEqual([]);
    await nextTask();
    await nextTask();
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(events).toEqual(["close 1000"]);
    expect(server.closedCount()).toBe(1);
    expect(server.sides[0]?.isOpen).toBe(false);
  });

  it("hears the host close it, with the host's code", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    const codes: number[] = [];
    socket.addEventListener("close", (event) => codes.push((event as CloseEvent).code));
    await nextTask();
    server.sides[0]?.close(4401, "unauthorized");
    await nextTask();
    expect(codes).toEqual([4401]);
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
  });

  it("refuses a socket to any address but the fake host's, and records it by address", async () => {
    recordingServer();
    const socket = new FakeSocket("ws://localhost:0");
    const events: string[] = [];
    socket.addEventListener("error", () => events.push("error"));
    socket.addEventListener("close", () => events.push("close"));
    await nextTask();
    expect(events).toEqual(["error", "close"]);
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(take()).toEqual([{ kind: "socket", detail: expect.stringContaining("ws://localhost:0") }]);
  });

  it("can be dropped by the host as a dying process drops it: queued frames, then error, then an unclean 1006", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    const events: string[] = [];
    socket.addEventListener("message", (event) => events.push(`message ${String((event as MessageEvent).data)}`));
    socket.addEventListener("error", () => events.push("error"));
    socket.addEventListener("close", (event) => {
      const close = event as CloseEvent;
      events.push(`close ${close.code} "${close.reason}" ${close.wasClean ? "clean" : "unclean"}`);
    });
    await nextTask();
    server.sides[0]?.send("last words");
    server.sides[0]?.drop();
    expect(server.sides[0]?.isOpen).toBe(false);
    await nextTask();
    await nextTask();
    expect(events).toEqual(["message last words", "error", 'close 1006 "" unclean']);
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(take()).toEqual([]);
  });

  it("refuses a socket to an address nobody listens on any more, as a dead port does, recording nothing", async () => {
    recordingServer();
    stopListening(ENDPOINT);
    const socket = new FakeSocket(ENDPOINT);
    const events: string[] = [];
    socket.addEventListener("error", () => events.push("error"));
    socket.addEventListener("close", (event) => events.push(`close ${(event as CloseEvent).code}`));
    await nextTask();
    expect(events).toEqual(["error", "close 1006"]);
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(take()).toEqual([]);
  });

  it("drops every frame still queued when the harness resets between tests", async () => {
    const server = recordingServer();
    const socket = new FakeSocket(ENDPOINT);
    const delivered: unknown[] = [];
    socket.addEventListener("message", (event) => delivered.push((event as MessageEvent).data));
    await nextTask();
    server.sides[0]?.send("never");
    resetSockets();
    await nextTask();
    await nextTask();
    expect(delivered).toEqual([]);
  });
});
