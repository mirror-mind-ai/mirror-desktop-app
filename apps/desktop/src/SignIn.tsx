import type { AuthFlowEvent, AuthFlowPrompt, AuthProvider, AuthType, HostEvent } from "@mirror-desktop/protocol";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, ExternalLink, KeyRound, LogIn, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { HostConnection } from "./host/client.ts";
import { Pulse } from "./shell/Pulse.tsx";

/**
 * Sign in to a model provider. Pi runs the flow in the host; this screen
 * shows what the flow says (`auth.event`) and answers what it asks
 * (`auth.prompt`). The browser is opened here, in the system browser, where
 * passkeys and the person's existing sessions already are.
 */

interface Flow {
  providerId: string;
  authType: AuthType;
  events: AuthFlowEvent[];
  prompt?: { promptId: string; prompt: AuthFlowPrompt };
  answer: string;
}

/** The flow with its open question withdrawn (the key omitted, as the type requires). */
function withoutPrompt(flow: Flow): Flow {
  const { prompt: _closed, ...rest } = flow;
  return { ...rest, answer: "" };
}

export function SignIn({
  client,
  onSignedIn,
  onDismiss,
}: {
  client: HostConnection;
  onSignedIn: () => void;
  onDismiss?: () => void;
}) {
  const [providers, setProviders] = useState<AuthProvider[] | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);

  async function refresh(): Promise<void> {
    const result = await client.request({ type: "auth.providers" });
    if (result.type === "auth.providers") setProviders(result.providers);
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
    const previous = client.onEvent;
    client.onEvent = (event: HostEvent) => {
      previous(event);
      if (event.type === "auth.event") {
        setFlow((current) => (current ? { ...current, events: [...current.events, event.event] } : current));
        if (event.event.type === "auth_url") void openUrl(event.event.url).catch(() => undefined);
      } else if (event.type === "auth.prompt") {
        setFlow((current) =>
          current ? { ...current, prompt: { promptId: event.promptId, prompt: event.prompt }, answer: "" } : current,
        );
      } else if (event.type === "auth.prompt_closed") {
        setFlow((current) => (current?.prompt?.promptId === event.promptId ? withoutPrompt(current) : current));
      }
    };
    return () => {
      client.onEvent = previous;
    };
  }, [client]);

  async function start(providerId: string, authType: AuthType): Promise<void> {
    setFlow({ providerId, authType, events: [], answer: "" });
    try {
      await client.request({ type: "auth.login", providerId, authType });
      toast.success(`Signed in to ${providerId}.`);
      setFlow(null);
      await refresh();
      onSignedIn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setFlow(null);
    }
  }

  async function answer(): Promise<void> {
    if (!flow?.prompt) return;
    const { promptId } = flow.prompt;
    const value = flow.answer;
    setFlow(withoutPrompt(flow));
    await client.request({ type: "auth.answer", promptId, value }).catch(() => undefined);
  }

  async function choose(id: string): Promise<void> {
    if (!flow?.prompt) return;
    const { promptId } = flow.prompt;
    setFlow(withoutPrompt(flow));
    await client.request({ type: "auth.answer", promptId, value: id }).catch(() => undefined);
  }

  async function cancel(): Promise<void> {
    if (!flow) return;
    await client.request({ type: "auth.cancel", providerId: flow.providerId }).catch(() => undefined);
  }

  return (
    <section className="flex flex-1 items-start justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-title">Sign in to a model provider</h1>
            <p className="text-ui text-muted">
              Credentials are stored by Pi in <code className="font-mono">~/.pi/agent/auth.json</code> and shared with terminal Pi.
            </p>
          </div>
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className="rounded-control border border-hairline px-3 py-1.5 text-ui hover:bg-hover">
              Back
            </button>
          ) : null}
        </header>

        {flow ? <FlowPanel flow={flow} onAnswerChange={(answer) => setFlow({ ...flow, answer })} onAnswer={answer} onChoose={choose} onCancel={cancel} /> : null}

        {providers === null ? (
          <p className="text-ui text-muted">Loading providers…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {providers.map((provider) => (
              <li key={provider.id} className="flex items-center justify-between gap-4 rounded-control border border-hairline bg-raised px-4 py-3">
                <div className="min-w-0">
                  <p className="text-ui font-bold">{provider.name}</p>
                  <p className="text-meta text-muted">
                    {provider.signedIn ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="size-3" aria-hidden="true" /> signed in via {provider.signedIn.authType}
                        {provider.signedIn.source ? ` · ${provider.signedIn.source}` : ""}
                      </span>
                    ) : (
                      "not signed in"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {provider.oauth ? (
                    <button
                      type="button"
                      disabled={flow !== null}
                      onClick={() => void start(provider.id, "oauth")}
                      className="flex items-center gap-2 rounded-control bg-accent px-3 py-1.5 text-ui text-on-accent disabled:bg-raised disabled:text-dim"
                    >
                      <LogIn className="size-3.5" aria-hidden="true" /> {provider.oauth.label}
                    </button>
                  ) : null}
                  {provider.apiKey ? (
                    <button
                      type="button"
                      disabled={flow !== null}
                      onClick={() => void start(provider.id, "api_key")}
                      className="flex items-center gap-2 rounded-control border border-hairline px-3 py-1.5 text-ui hover:bg-hover disabled:text-dim"
                    >
                      <KeyRound className="size-3.5" aria-hidden="true" /> API key
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FlowPanel({
  flow,
  onAnswerChange,
  onAnswer,
  onChoose,
  onCancel,
}: {
  flow: Flow;
  onAnswerChange: (answer: string) => void;
  onAnswer: () => void;
  onChoose: (id: string) => void;
  onCancel: () => void;
}) {
  const url = [...flow.events].reverse().find((event) => event.type === "auth_url");
  const prompt = flow.prompt?.prompt;
  return (
    <div className="flex flex-col gap-3 rounded-control border border-accent/40 bg-raised p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-ui font-bold">
          <Pulse />
          Signing in to {flow.providerId} ({flow.authType === "oauth" ? "browser" : "API key"})
        </p>
        <button type="button" onClick={onCancel} className="flex items-center gap-1 text-ui text-muted hover:text-ink">
          <X className="size-3.5" aria-hidden="true" /> Cancel
        </button>
      </div>

      {flow.events.map((event, index) => (
        <p key={index} className="text-ui text-muted">
          {event.type === "auth_url"
            ? (event.instructions ?? "Continue in your browser.")
            : event.type === "device_code"
              ? `Enter code ${event.userCode} at ${event.verificationUri}`
              : event.message}
        </p>
      ))}

      {url?.type === "auth_url" ? (
        <button
          type="button"
          onClick={() => void openUrl(url.url)}
          className="flex w-fit items-center gap-2 rounded-control border border-hairline px-3 py-1.5 text-ui hover:bg-hover"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" /> Open the sign-in page again
        </button>
      ) : null}

      {prompt?.type === "select" ? (
        <div className="flex flex-col gap-2">
          <p className="text-ui">{prompt.message}</p>
          <div className="flex flex-wrap gap-2">
            {prompt.options.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onChoose(choice.id)}
                title={choice.description}
                className="rounded-control border border-hairline px-3 py-1.5 text-ui hover:border-accent"
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {prompt && prompt.type !== "select" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onAnswer();
          }}
        >
          <label className="text-ui" htmlFor="auth-answer">
            {prompt.message}
          </label>
          <div className="flex gap-2">
            <input
              id="auth-answer"
              type={prompt.type === "secret" ? "password" : "text"}
              autoComplete="off"
              placeholder={prompt.placeholder}
              value={flow.answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              className="flex-1 rounded-control border border-hairline bg-canvas px-3 py-2 font-mono text-ui outline-none placeholder:text-dim focus:border-focus"
            />
            <button
              type="submit"
              disabled={!flow.answer.trim()}
              className="rounded-control bg-accent px-3 py-2 text-ui text-on-accent disabled:bg-raised disabled:text-dim"
            >
              {prompt.type === "manual_code" ? "Use code" : "Continue"}
            </button>
          </div>
          {prompt.type === "manual_code" ? (
            <p className="text-meta text-muted">Finishing in the browser completes this on its own; the field is a fallback.</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
