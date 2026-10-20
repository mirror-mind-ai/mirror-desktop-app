import { PROTOCOL_VERSION } from "@mirror-desktop/protocol";
import { Sparkles } from "lucide-react";
import { Toaster } from "sonner";

/**
 * The scaffold screen. It exists to prove the pipeline — React, Tailwind
 * tokens, lucide, sonner and the shared protocol package — renders inside the
 * Tauri window. The real shell (sidebar, conversation, composer) replaces it
 * once the host prototype streams its first turn.
 */
export function App() {
  return (
    <main className="flex h-screen items-center justify-center bg-background text-foreground">
      <section className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
        <Sparkles className="size-8 text-accent" aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Mirror Desktop</h1>
        <p className="text-sm text-muted-foreground">
          Scaffold build. The host, the conversation and the Journeys arrive with the first spikes.
        </p>
        <p className="font-mono text-xs text-muted-foreground">protocol {PROTOCOL_VERSION}</p>
      </section>
      <Toaster position="bottom-right" />
    </main>
  );
}
