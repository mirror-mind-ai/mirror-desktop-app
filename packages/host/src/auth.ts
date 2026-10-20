// Provider sign-in, bridged from Pi to the UI.
//
// Pi's `ModelRuntime.login()` runs a provider's own flow — Anthropic and
// OpenAI OAuth with a loopback callback server, device codes, API keys —
// and persists the credential in `auth.json`, the same file terminal Pi
// reads. The flow talks to the person through an `AuthInteraction`: things
// to show (`notify`) and questions to answer (`prompt`). This broker is that
// interaction, with the UI on the other side of the socket: every `notify`
// becomes an `auth.event`, every `prompt` becomes an `auth.prompt` the UI
// answers with `auth.answer`.
//
// The one `ModelRuntime` here is the one every session is created with, so
// a credential signed in here is in force for the next turn without a
// restart.

import {
  getAgentDir,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import type {
  AuthFlowEvent,
  AuthFlowPrompt,
  AuthProvider,
  AuthType,
  AvailableModel,
  HostEvent,
} from "@mirror-desktop/protocol";
import { newId } from "mirror-mind/ts/src/index.ts";

export class AuthProviderNotFoundError extends Error {
  override readonly name = "AuthProviderNotFoundError";
}

export class AuthInProgressError extends Error {
  override readonly name = "AuthInProgressError";
}

export class AuthPromptNotFoundError extends Error {
  override readonly name = "AuthPromptNotFoundError";
}

export class AuthFailedError extends Error {
  override readonly name = "AuthFailedError";
}

interface PendingPrompt {
  providerId: string;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

export class AuthBroker {
  readonly #runtime: ModelRuntime;
  readonly #settings: SettingsManager;
  readonly #emit: (event: HostEvent) => void;
  readonly #flows = new Map<string, AbortController>();
  readonly #prompts = new Map<string, PendingPrompt>();

  private constructor(runtime: ModelRuntime, settings: SettingsManager, emit: (event: HostEvent) => void) {
    this.#runtime = runtime;
    this.#settings = settings;
    this.#emit = emit;
  }

  static async create(emit: (event: HostEvent) => void): Promise<AuthBroker> {
    const agentDir = getAgentDir();
    const runtime = await ModelRuntime.create();
    // Global settings only: the device id OpenAI's flow asks for lives there.
    const settings = SettingsManager.create(agentDir, agentDir);
    return new AuthBroker(runtime, settings, emit);
  }

  /** The runtime sessions must be created with, so sign-ins apply to them. */
  get modelRuntime(): ModelRuntime {
    return this.#runtime;
  }

  /** Every provider Pi knows that can be signed into, with its current state. */
  providers(): AuthProvider[] {
    const providers: AuthProvider[] = [];
    for (const provider of this.#runtime.getProviders()) {
      const oauth = provider.auth.oauth;
      const apiKey = provider.auth.apiKey;
      if (!oauth && !apiKey?.login) continue;
      const status = this.#runtime.getProviderAuthStatus(provider.id);
      const entry: AuthProvider = { id: provider.id, name: provider.name };
      if (oauth) entry.oauth = { label: oauth.loginLabel ?? oauth.name, subscription: oauth.isSubscription === true };
      if (apiKey?.login) entry.apiKey = { label: apiKey.name };
      if (status.configured) {
        const source = status.label ?? status.source;
        entry.signedIn = {
          authType: this.#runtime.isUsingOAuth(provider.id) ? "oauth" : "api_key",
          ...(source ? { source } : {}),
        };
      }
      providers.push(entry);
    }
    return providers.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Run a sign-in flow to its end. Resolves once the credential is stored. */
  async login(providerId: string, authType: AuthType): Promise<void> {
    if (!this.#runtime.getProvider(providerId)) {
      throw new AuthProviderNotFoundError(`Pi knows no provider ${providerId}.`);
    }
    if (this.#flows.has(providerId)) throw new AuthInProgressError(`${providerId} is already signing in.`);
    const controller = new AbortController();
    this.#flows.set(providerId, controller);
    try {
      await this.#runtime.login(
        providerId,
        authType,
        {
          signal: controller.signal,
          notify: (event) => this.#emit({ type: "auth.event", providerId, event: flowEvent(event) }),
          prompt: (prompt) => this.#ask(providerId, prompt),
        },
        { getDeviceId: () => this.#settings.getOrCreateDeviceId(), agentName: "Mirror Desktop" },
      );
    } catch (cause) {
      const message = controller.signal.aborted ? "Sign-in cancelled." : cause instanceof Error ? cause.message : String(cause);
      throw new AuthFailedError(message, { cause });
    } finally {
      this.#flows.delete(providerId);
      for (const [promptId, pending] of this.#prompts) {
        if (pending.providerId === providerId) this.#close(promptId, new Error("The sign-in ended."));
      }
    }
  }

  answer(promptId: string, value: string): void {
    const pending = this.#prompts.get(promptId);
    if (!pending) throw new AuthPromptNotFoundError(`No open question ${promptId}.`);
    this.#prompts.delete(promptId);
    pending.resolve(value);
  }

  cancel(providerId: string): void {
    this.#flows.get(providerId)?.abort();
  }

  async logout(providerId: string): Promise<void> {
    if (!this.#runtime.getProvider(providerId)) {
      throw new AuthProviderNotFoundError(`Pi knows no provider ${providerId}.`);
    }
    await this.#runtime.logout(providerId);
  }

  async available(): Promise<AvailableModel[]> {
    const models = await this.#runtime.getAvailable();
    return models.map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
    }));
  }

  /** A question for the UI: emitted once, answered by `answer()`, or withdrawn when the flow moves on. */
  #ask(providerId: string, prompt: AuthPrompt): Promise<string> {
    const promptId = newId();
    const { signal, ...rest } = prompt;
    const shown: AuthFlowPrompt = rest.type === "select" ? { ...rest, options: [...rest.options] } : rest;
    return new Promise<string>((resolve, reject) => {
      this.#prompts.set(promptId, { providerId, resolve, reject });
      signal?.addEventListener("abort", () => this.#close(promptId, new Error("The sign-in no longer needs this.")), {
        once: true,
      });
      this.#emit({ type: "auth.prompt", providerId, promptId, prompt: shown });
    });
  }

  #close(promptId: string, reason: Error): void {
    const pending = this.#prompts.get(promptId);
    if (!pending) return;
    this.#prompts.delete(promptId);
    this.#emit({ type: "auth.prompt_closed", promptId });
    pending.reject(reason);
  }
}

/** Pi's event, with its readonly arrays copied into the protocol's mutable shape. */
function flowEvent(event: AuthEvent): AuthFlowEvent {
  if (event.type === "info") {
    return { type: "info", message: event.message, ...(event.links ? { links: event.links.map((link) => ({ ...link })) } : {}) };
  }
  return event;
}
