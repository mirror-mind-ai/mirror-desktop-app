import { useEffect } from "react";
import { Toaster } from "sonner";

import { HostClient, hostEndpoint } from "./host/client.ts";
import { type ConnectionLease, connectToHost } from "./host/connect.ts";
import { useHost } from "./host/store.ts";
import { Shell } from "./shell/Shell.tsx";

/** The app: the shell, connected to the host, and connected again on each Try again. */
export function App() {
  const attempt = useHost((state) => state.attempt);

  useEffect(() => {
    // StrictMode mounts twice in development. A connection that resolves after
    // its effect was cleaned up must close itself, or two clients stay
    // attached and every delta renders twice (seen as `**4**4****`). The lease
    // is how connectToHost knows the effect gave it up.
    const lease: ConnectionLease = { cancelled: false, client: null };
    void connectToHost(async () => HostClient.connect(await hostEndpoint()), lease);
    return () => {
      lease.cancelled = true;
      lease.client?.close();
    };
  }, [attempt]);

  return (
    <>
      <Shell />
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
}
