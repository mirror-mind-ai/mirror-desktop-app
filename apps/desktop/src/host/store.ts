// The connection to the host, as the shell shows it.
//
// The shell reads one status. While the host is connecting or connected the
// app waits; once it is ready the person can work, with or without a model;
// when it failed, the shell says so in place of everything else and offers to
// try again, because without the host nothing in the app can work. A host
// that was ready and then went away is the same failure, with one more thing
// to say: a conversation was cut off, and nothing brings the host back today.

import type { HostIdentity } from "@mirror-desktop/protocol";
import { create } from "zustand";

import { registerStore } from "../stores/registry.ts";
import type { HostConnection } from "./client.ts";

export type HostStatus =
  /** Finding the endpoint, opening the socket, saying hello. */
  | "connecting"
  /** Hello answered; which models can be used is not known yet. */
  | "connected"
  /** The host is there and has said whether any model can be used. */
  | "ready"
  /** The host could not be reached, or would not talk; `failure` says why. */
  | "failed";

export interface HostState {
  readonly status: HostStatus;
  readonly client: HostConnection | null;
  readonly identity: HostIdentity | null;
  /** Whether any model can be used right now. Meaningful once ready. */
  readonly canUseModels: boolean;
  readonly failure: string | null;
  /** The failure came after the host was ready: the person was working, and what they had on screen is gone. */
  readonly lostAfterReady: boolean;
  /** Counts the person's Try agains: the shell connects again whenever it changes. */
  readonly attempt: number;
}

const initialState: HostState = {
  status: "connecting",
  client: null,
  identity: null,
  canUseModels: false,
  failure: null,
  lostAfterReady: false,
  attempt: 0,
};

export const useHost = create<HostState>()(() => initialState);
registerStore("host", useHost, initialState);

/** Hello was answered on `client`. */
export function hostConnected(client: HostConnection, identity: HostIdentity): void {
  useHost.setState({ status: "connected", client, identity, failure: null });
}

/** The host said whether any model can be used. Ignored from a connection the shell has since replaced. */
export function hostReady(client: HostConnection, canUseModels: boolean): void {
  if (useHost.getState().client !== client) return;
  useHost.setState({ status: "ready", canUseModels });
}

export function hostFailed(failure: string): void {
  useHost.setState({ status: "failed", client: null, failure, lostAfterReady: false });
}

/** The connection ended after the host was ready. Ignored from a connection the shell has since replaced. */
export function hostLost(client: HostConnection, failure: string): void {
  if (useHost.getState().client !== client) return;
  useHost.setState({ status: "failed", client: null, failure, lostAfterReady: true });
}

/** The person asked to connect again. */
export function tryHostAgain(): void {
  useHost.setState((state) => ({ ...initialState, attempt: state.attempt + 1 }), true);
}

/** A sign-in finished: there is a model to use now. */
export function signedIn(): void {
  useHost.setState({ canUseModels: true });
}
