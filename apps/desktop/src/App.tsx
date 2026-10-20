import type { HostEvent, HostIdentity, SessionEvent } from "@mirror-desktop/protocol";
import { Loader2, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

import { HostClient, hostEndpoint } from "./host/client.ts";

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
  model?: string;
  thinkingLevel: string;
}

export function App() {
  const [host, setHost] = useState<HostIdentity | null>(null);
  const [client, setClient] = useState<HostClient | null>(null);
  const [cwd, setCwd] = useState("/Users/vinicius/dev/workspace/mirror-desktop-app");
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active: HostClient | null = null;
    void hostEndpoint()
      .then((endpoint) => HostClient.connect(endpoint))
      .then(({ client: connected, host: identity }) => {
        active = connected;
        connected.onEvent = applyEvent;
        setClient(connected);
        setHost(identity);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
    return () => active?.close();
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

  async function openSession(): Promise<void> {
    if (!client) return;
    setOpening(true);
    try {
      const result = await client.request({ type: "session.open", cwd });
      if (result.type !== "session.open") return;
      setSession({
        id: result.sessionId,
        file: result.sessionFile,
        ...(result.model ? { model: `${result.model.provider}/${result.model.id}` } : {}),
        thinkingLevel: result.thinkingLevel,
      });
      setRows([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
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
      </header>

      {!session ? (
        <section className="flex flex-1 items-center justify-center p-8">
          <form
            className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border bg-card p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void openSession();
            }}
          >
            <label className="text-sm text-muted-foreground" htmlFor="cwd">
              Working directory of the Journey
            </label>
            <input
              id="cwd"
              className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={!client || opening}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {opening ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {opening ? "Opening session…" : "Open session"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="border-b border-border px-5 py-2 font-mono text-xs text-muted-foreground">
            session {session.id} · {session.model ?? "model?"} · thinking {session.thinkingLevel}
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
