import { useHost } from "../host/store.ts";
import { loadJourneys } from "../journeys/store.ts";

/**
 * Ask Mirror for the Journeys again: after the person fixed something outside
 * the app (set Mirror up, gave a Journey a project path, created one), so the
 * fix shows without restarting.
 */
export function RefreshJourneys({ label }: { label: string }) {
  const client = useHost((state) => state.client);
  return (
    <button
      type="button"
      disabled={!client}
      onClick={() => {
        if (client) void loadJourneys(client);
      }}
      className="w-fit rounded-control border border-hairline px-2.5 py-1 text-ui enabled:hover:bg-hover disabled:text-dim"
    >
      {label}
    </button>
  );
}
