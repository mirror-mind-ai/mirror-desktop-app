import { tryHostAgain, useHost } from "../host/store.ts";

/**
 * Without the host nothing in the app can work, so this takes the whole
 * conversation area: what happened, the host's own words, and a way to try
 * again. Reconnecting on its own is CV1.DS2's.
 */
export function HostUnreachable() {
  const failure = useHost((state) => state.failure);
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="font-display text-lg font-semibold">The host could not be reached</h1>
        <p className="text-sm text-muted-foreground">
          Mirror Desktop reaches Pi and Mirror through its host. Until the host answers, nothing here can work.
        </p>
        {failure ? <p className="font-mono text-xs break-words text-muted-foreground">{failure}</p> : null}
        <button
          type="button"
          onClick={tryHostAgain}
          className="w-fit rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
