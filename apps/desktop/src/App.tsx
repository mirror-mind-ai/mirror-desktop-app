import type { HostEvent, HostIdentity, Journey, SessionEvent } from "@mirror-desktop/protocol";
import { Compass, KeyRound, Loader2, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

import { HostClient, hostEndpoint } from "./host/client.ts";
import { SignIn } from "./SignIn.tsx";

/**
 * The spike console: the thinnest screen that exercises the whole path —
 * shell → host endpoint → WebSocket → Pi session → streamed turn — inside the
 * Tauri window. It is not the product's conversation surface; that one grows
 * from stores and components once this path is proven.
 */

type Row =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; done: boolean; stopReason?: string; errorMessage?: string }
  | { kind: "tool"; toolCallId: string; name: string; summary: string; done: boolean; isError?: boolean; durationMs?: number }
  | { kind: "notice"; text: string };

interface Session {
  id: string;
  file: string;
  journey?: string;
  mirrorConversationId?: string;
  model?: string;
  thinkingLevel: string;
}

export function App() {
  const [host, setHost] = useState<HostIdentity | null>(null);
  const [client, setClient] = useState<HostClient | null>(null);
  /** Whether any model can be used; null until the host answered. */
  const [canUseModels, setCanUseModels] = useState<boolean | null>(null);
  const [showProviders, setShowProviders] = useState(false);
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [journeysError, setJourneysError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // StrictMode mounts twice in development. A connection that resolves
    // after its effect was cleaned up must close itself, or two clients stay
    // attached and every delta renders twice (seen as `**4**4****`).
    let cancelled = false;
    let active: HostClient | null = null;
    void hostEndpoint()
      .then((endpoint) => HostClient.connect(endpoint))
      .then(({ client: connected, host: identity }) => {
        if (cancelled) {
          connected.close();
          return;
        }
        active = connected;
        connected.onEvent = applyEvent;
        setClient(connected);
        setHost(identity);
        return connected.request({ type: "models.available" });
      })
      .then((result) => {
        if (result && result.type === "models.available") setCanUseModels(result.models.length > 0);
      })
      .then(() => active?.request({ type: "journeys.list" }))
      .then((result) => {
        if (result && result.type === "journeys.list") setJourneys(result.journeys);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setJourneysError(message);
        toast.error(message);
      });
    return () => {
      cancelled = true;
      active?.close();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [rows]);

  function applyEvent(event: HostEvent): void {
    if (event.type === "session.extension_error") {
      setRows((prev) => [...prev, { kind: "notice", text: `${event.extension} failed on ${event.event}: ${event.message}` }]);
      return;
    }
    if (event.type !== "session.event") return;
    setRows((prev) => reduceRows(prev, event.event));
    if (event.event.type === "agent_settled") setBusy(false);
  }

  async function openSession(journey: string): Promise<void> {
    if (!client) return;
    setOpening(journey);
    try {
      const result = await client.request({ type: "session.open", journey });
      if (result.type !== "session.open") return;
      setSession({
        id: result.sessionId,
        file: result.sessionFile,
        ...(result.journey ? { journey: result.journey } : {}),
        ...(result.mirrorConversationId ? { mirrorConversationId: result.mirrorConversationId } : {}),
        ...(result.model ? { model: `${result.model.provider}/${result.model.id}` } : {}),
        thinkingLevel: result.thinkingLevel,
      });
      setRows(result.diagnostics.map((text) => ({ kind: "notice", text })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(null);
    }
  }

  async function send(): Promise<void> {
    if (!client || !session || !draft.trim() || busy) return;
    const text = draft.trim();
    setDraft("");
    setRows((prev) => [...prev, { kind: "user", text }]);
    setBusy(true);
    try {
      await client.request({ type: "session.prompt", sessionId: session.id, text });
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function abort(): Promise<void> {
    if (!client || !session) return;
    await client.request({ type: "session.abort", sessionId: session.id }).catch(() => undefined);
  }

  return (
    <main className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3 pl-24 text-sm" data-tauri-drag-region>
        <Sparkles className="size-4 text-accent" aria-hidden="true" />
        <span className="font-display font-semibold">Mirror Desktop</span>
        <span className="font-mono text-xs text-muted-foreground">
          {host ? `host · node ${host.node} · pi ${host.pi} · mirror ${host.mirror}` : "connecting to host…"}
        </span>
        <span className="flex-1" />
        {client && canUseModels !== null ? (
          <button
            type="button"
            onClick={() => setShowProviders((value) => !value)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <KeyRound className="size-3.5" aria-hidden="true" /> Providers
          </button>
        ) : null}
      </header>

      {client && canUseModels !== null && (showProviders || !canUseModels) ? (
        <SignIn
          client={client}
          onSignedIn={() => {
            setCanUseModels(true);
            setShowProviders(false);
          }}
          {...(canUseModels ? { onDismiss: () => setShowProviders(false) } : {})}
        />
      ) : !session ? (
        <section className="flex flex-1 justify-center overflow-y-auto p-8">
          <div className="flex w-full max-w-2xl flex-col gap-3">
            <h1 className="font-display text-xl font-semibold">Open a Journey</h1>
            {journeysError ? <p className="text-sm text-amber-400">{journeysError}</p> : null}
            {journeys === null ? (
              <p className="text-sm text-muted-foreground">Loading Journeys from Mirror…</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {journeys
                  .filter((journey) => journey.status === "active")
                  .map((journey) => (
                    <li key={journey.id}>
                      <button
                        type="button"
                        disabled={!journey.projectPath || opening !== null}
                        onClick={() => void openSession(journey.id)}
                        title={journey.projectPath ?? "This Journey has no project path yet"}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {opening === journey.id ? (
                          <Loader2 className="size-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
                        ) : (
                          <Compass className="size-4 shrink-0 text-accent" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{journey.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {journey.description || journey.id}
                          </span>
                        </span>
                        <span className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                          {journey.projectPath ? journey.projectPath.replace(/^\/Users\/[^/]+/, "~") : "no project path"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="border-b border-border px-5 py-2 font-mono text-xs text-muted-foreground">
            {session.journey ? `${session.journey} · ` : ""}session {session.id}
            {session.mirrorConversationId ? ` · mirror conversation ${session.mirrorConversationId}` : ""} · {session.model ?? "model?"} ·
            thinking {session.thinkingLevel}
          </div>
          <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {rows.map((row, index) => (
              <Transcript key={index} row={row} />
            ))}
          </div>
          <form
            className="flex items-end gap-2 border-t border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              className="min-h-[3rem] flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Say something to Pi…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                onClick={() => void abort()}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
              >
                <Square className="size-4" aria-hidden="true" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                <Send className="size-4" aria-hidden="true" /> Send
              </button>
            )}
          </form>
        </>
      )}
      <Toaster position="bottom-right" theme="dark" />
    </main>
  );
}

function Transcript({ row }: { row: Row }) {
  switch (row.kind) {
    case "user":
      return <p className="ml-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2 text-sm whitespace-pre-wrap">{row.text}</p>;
    case "assistant":
      return (
        <div className="max-w-[90%] text-sm whitespace-pre-wrap">
          {row.text}
          {!row.done ? <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-accent align-middle" /> : null}
          {row.errorMessage ? <p className="mt-1 text-xs text-red-400">{row.errorMessage}</p> : null}
        </div>
      );
    case "tool":
      return (
        <p className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {row.done ? (row.isError ? "✗" : "✓") : "…"} {row.name} {row.summary}
          {row.durationMs !== undefined ? ` · ${row.durationMs} ms` : ""}
        </p>
      );
    case "notice":
      return <p className="text-xs text-amber-400">{row.text}</p>;
  }
}

/** Fold one session event into the transcript rows. Pure, so it can be tested without a screen. */
export function reduceRows(rows: Row[], event: SessionEvent): Row[] {
  const last = rows[rows.length - 1];
  switch (event.type) {
    case "text_delta": {
      if (last?.kind === "assistant" && !last.done) {
        return [...rows.slice(0, -1), { ...last, text: last.text + event.delta }];
      }
      return [...rows, { kind: "assistant", text: event.delta, done: false }];
    }
    case "message_end": {
      if (event.role !== "assistant") return rows;
      if (last?.kind === "assistant" && !last.done) {
        return [
          ...rows.slice(0, -1),
          {
            ...last,
            done: true,
            ...(event.stopReason ? { stopReason: event.stopReason } : {}),
            ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
          },
        ];
      }
      if (event.errorMessage) return [...rows, { kind: "notice", text: event.errorMessage }];
      return rows;
    }
    case "tool_start":
      return [
        ...rows,
        {
          kind: "tool",
          toolCallId: event.toolCallId,
          name: event.toolName,
          summary: JSON.stringify(event.args).slice(0, 160),
          done: false,
        },
      ];
    case "tool_end":
      return rows.map((row) =>
        row.kind === "tool" && row.toolCallId === event.toolCallId
          ? {
              ...row,
              done: true,
              isError: event.isError,
              ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
            }
          : row,
      );
    case "retry":
      return [...rows, { kind: "notice", text: `retrying (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}` }];
    default:
      return rows;
  }
}
