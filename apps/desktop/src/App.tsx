import { useEffect } from "react";
import { Toaster } from "sonner";

import { HostClient, hostEndpoint } from "./host/client.ts";
import { type ConnectionLease, connectToHost } from "./host/connect.ts";
import { useHost } from "./host/store.ts";
import { Shell } from "./shell/Shell.tsx";
import { browserThemeEnvironment } from "./theme/environment.ts";
import { syncTheme } from "./theme/lifecycle.ts";
import { resolvedTheme, useTheme } from "./theme/store.ts";

/**
 * The app: the shell, connected to the host, and connected again on each Try
 * again; in the theme main.tsx booted, kept in sync while it is mounted.
 */
export function App() {
  const attempt = useHost((state) => state.attempt);
  const theme = useTheme(resolvedTheme);

  useEffect(() => syncTheme(browserThemeEnvironment()), []);

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
      {/* Top right, below the header: at the bottom a toast would cover the composer's Send. */}
      <Toaster position="top-right" offset={{ top: 64, right: 24 }} theme={theme} />
    </>
  );
}
