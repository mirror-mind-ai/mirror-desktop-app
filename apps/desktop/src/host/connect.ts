// Bringing the app up against the host, one step at a time.
//
// Each step's failure is shown where it means something. If the endpoint,
// the socket, hello or models.available fails, the host cannot be used and
// the shell says so (host failed). If journeys.list fails, the host is still
// there and only the sidebar has something to say (journeys failed).
//
// A connection the shell has given up on (StrictMode's first mount, or an
// attempt replaced by Try again) must never write to the stores: two
// connections feeding one screen rendered every delta twice in the spike.
// The lease says when that has happened, and every step checks it after it
// waits.
//
// A connection that ends after the host was ready is reported by its close:
// the host failed, after ready, and the conversations settle what was
// answering. Before ready, the step that was waiting reports it through its
// own rejection, so the close is left to it: one report, not two.

import type { HostIdentity } from "@mirror-desktop/protocol";

import { applyHostEvent, connectionLost } from "../conversations/store.ts";
import { loadJourneys } from "../journeys/store.ts";
import { failureOf, type HostConnection } from "./client.ts";
import { hostConnected, hostFailed, hostLost, hostReady } from "./store.ts";

export interface ConnectionLease {
  /** Set by whoever started the connection once they no longer want it. */
  cancelled: boolean;
  /** The connection once it is open, so whoever gives up the lease can close it. */
  client: HostConnection | null;
}

export async function connectToHost(
  open: () => Promise<{ client: HostConnection; host: HostIdentity }>,
  lease: ConnectionLease,
): Promise<void> {
  let opened: { client: HostConnection; host: HostIdentity };
  try {
    opened = await open();
  } catch (error) {
    if (!lease.cancelled) hostFailed(failureOf(error).message);
    return;
  }
  const { client } = opened;
  if (lease.cancelled) {
    client.close();
    return;
  }
  lease.client = client;
  client.onEvent = applyHostEvent;
  hostConnected(client, opened.host);

  let canUseModels: boolean;
  try {
    const result = await client.request({ type: "models.available" });
    if (result.type !== "models.available") throw new Error("The host answered models.available with something else.");
    canUseModels = result.models.length > 0;
  } catch (error) {
    if (!lease.cancelled) hostFailed(failureOf(error).message);
    return;
  }
  if (lease.cancelled) return;
  hostReady(client, canUseModels);
  client.onClose = (lost) => {
    if (lease.cancelled) return;
    hostLost(client, lost.message);
    connectionLost();
  };
  await loadJourneys(client);
}
