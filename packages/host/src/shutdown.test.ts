import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { shutdownHost } from "./shutdown.ts";

let httpServer: Server;
let server: WebSocketServer;
const clients: WebSocket[] = [];

async function listening(): Promise<number> {
  httpServer = createServer();
  server = new WebSocketServer({ server: httpServer });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  return typeof address === "object" && address ? address.port : 0;
}

async function connect(port: number): Promise<{ socket: WebSocket; closed: Promise<{ code: number; reason: string }> }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once("open", resolve));
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  return { socket, closed };
}

afterEach(() => {
  for (const socket of clients) socket.terminate();
  clients.length = 0;
  server.close();
  httpServer.close();
});

describe("the host shutting down", () => {
  it("closes every session, says goodbye to every connection with 1001, then exits", async () => {
    const port = await listening();
    const first = await connect(port);
    const second = await connect(port);
    const steps: string[] = [];

    await shutdownHost({
      closeSessions: async () => {
        steps.push("sessions");
      },
      server,
      httpServer,
      exit: () => steps.push("exit"),
      sessionsBoundMs: 1000,
      goodbyeBoundMs: 1000,
    });

    expect(await first.closed).toEqual({ code: 1001, reason: "going away" });
    expect(await second.closed).toEqual({ code: 1001, reason: "going away" });
    expect(steps).toEqual(["sessions", "exit"]);
  });

  it("does not wait on a session that hangs, nor on a connection that will not answer the goodbye", async () => {
    const port = await listening();
    const { socket } = await connect(port);
    // A client that never reads the goodbye, so never answers the close handshake: the host must not wait on it.
    (socket as unknown as { _socket: { pause(): void } })._socket.pause();
    let exited = false;

    const started = Date.now();
    await shutdownHost({
      closeSessions: () => new Promise<void>(() => {}),
      server,
      httpServer,
      exit: () => {
        exited = true;
      },
      sessionsBoundMs: 50,
      goodbyeBoundMs: 50,
    });

    expect(exited).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
