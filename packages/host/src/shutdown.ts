// How the host stops, when the shell tells it to (SIGTERM on quit) or the
// shell is gone (stdin closed).
//
// Sessions close first, so every extension sees `session_shutdown` before the
// process goes; a close that hangs is cut short after a bound. Then every
// connection is told goodbye with 1001, so a window still attached learns the
// host is going rather than waiting on a socket that will never answer; one
// that does not finish the close handshake is cut after a bound too. Only
// then do the servers close and the process exit. Nothing here is ever waited
// on without a bound: a host that cannot be told to stop is the worse bug.

import type { Server } from "node:http";

import type { WebSocketServer } from "ws";

export interface ShutdownDeps {
  closeSessions: () => Promise<void>;
  server: WebSocketServer;
  httpServer: Server;
  exit: () => void;
  sessionsBoundMs: number;
  goodbyeBoundMs: number;
}

export async function shutdownHost(deps: ShutdownDeps): Promise<void> {
  await withinBound(deps.closeSessions(), deps.sessionsBoundMs);
  await withinBound(sayGoodbye(deps.server), deps.goodbyeBoundMs);
  for (const socket of deps.server.clients) socket.terminate();
  deps.server.close();
  deps.httpServer.closeAllConnections();
  deps.httpServer.close();
  deps.exit();
}

/** Close every connection with 1001, resolving once each has answered the handshake. */
function sayGoodbye(server: WebSocketServer): Promise<void> {
  return Promise.all(
    [...server.clients].map(
      (socket) =>
        new Promise<void>((resolve) => {
          socket.once("close", () => resolve());
          socket.close(1001, "going away");
        }),
    ),
  ).then(() => undefined);
}

function withinBound(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const bound = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([work.catch(() => undefined), bound]).then(() => {
    clearTimeout(timer);
  });
}
