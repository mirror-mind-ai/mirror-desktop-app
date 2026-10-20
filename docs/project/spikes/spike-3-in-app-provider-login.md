# Spike 3 — In-app provider login

**Date:** 2026-10-20
**Question:** can a person sign in to a model provider from inside the app —
OAuth through the system browser or an API key — with the credential stored
where Pi keeps it, so that the next turn uses it without a restart?

**Answer: yes,** and without the deep link the proposal assumed. Pi's
providers run their own loopback callback servers (Anthropic on
`localhost:53692`, OpenAI on `127.0.0.1:1455`); the app's only native job is
opening the URL in the system browser.

## How Pi models it

`ModelRuntime.login(providerId, type, interaction)` runs a provider's flow
and persists the credential in `auth.json`. The flow talks through an
`AuthInteraction`: `notify(event)` for things to show (`auth_url`,
`device_code`, `progress`, `info`) and `prompt(prompt)` for questions to
answer (`select`, `secret`, `text`, `manual_code`). The `manual_code`
prompt is raced against the callback server and withdrawn when the callback
wins. This is exactly the shape the terminal UI implements; the host
implements it over the socket instead.

## What was built

- Protocol 0.3.0: `auth.providers`, `auth.login`, `auth.answer`,
  `auth.cancel`, `auth.logout`, `models.available`; events `auth.event`,
  `auth.prompt`, `auth.prompt_closed`; errors `auth_*`.
- `packages/host/src/auth.ts`: `AuthBroker` — one `ModelRuntime` for the
  whole host, which every session is created with, so a sign-in applies to
  the next turn. Providers are listed as the terminal's `/login` lists
  them (OAuth with its label and subscription flag, API key, current state
  and source). A flow's prompts are held until the UI answers or the flow
  withdraws them.
- `apps/desktop/src/SignIn.tsx`: the sign-in screen — providers with their
  methods and state, a flow panel that opens `auth_url` in the system
  browser (`tauri-plugin-opener`, scoped to `https://*`), renders selects as
  buttons and secrets as password fields, shows the manual-code fallback,
  and cancels. The app shows it first when no model is usable, and behind
  a **Providers** button otherwise.
- `packages/host/scripts/login.ts`: drives a sign-in from the terminal,
  with a scratch `HOME` to see a fresh machine.

## Verified

With `HOME=/tmp/fresh-home` (no `~/.pi` at all):

- **API key**: `secret` prompt bridged and answered; `auth.json` created
  (mode 600) with the credential; `auth.providers` reports "signed in via
  api_key (stored)"; `models.available` lists 17 Anthropic models.
- **OAuth, Anthropic and OpenAI**: `select` (browser / copy-code or device
  code) → `auth_url` with instructions → `manual_code` prompt raced with the
  callback → `auth.cancel` closes the prompt and fails the login as
  "Sign-in cancelled." The browser leg itself was left to a person: the
  bundled app, launched with a fresh HOME, opened on the sign-in screen.

## Findings

1. **No deep link is needed for provider OAuth.** Custom URL schemes remain
   useful for other things (open a Journey from a link), not for this.
2. **Sharing `~/.pi/agent` with terminal Pi cuts both ways.** A person who
   already uses Pi is signed in on first launch; a fresh machine starts
   empty, as it should. `logout` exists in the protocol but has no button:
   forgetting a credential the terminal also relies on deserves a
   confirmation the spike console does not have.
3. **A fresh HOME has no user packages.** This machine's terminal Pi loads
   `pi-cc-patch` from `~/.pi/agent/settings.json` for Claude subscription
   access; a fresh HOME does not, and whether inference on a subscription
   credential then works is a provider-policy question for the product, not
   something this spike settles. API keys and OpenAI are unaffected.
4. **One flow per provider at a time**, enforced in the host; a second
   `auth.login` for the same provider is refused as `auth_in_progress`.
5. **The select prompt is generic on purpose.** The desktop could auto-pick
   "browser", but rendering the provider's own choices keeps copy-code and
   device-code flows reachable for remote-display cases at no cost.

## Not in this spike

- Onboarding as a sequence (Mirror home, provider, OpenRouter key, name) —
  the sign-in screen is one step of it.
- Model selection UI; `models.available` is the data for it.
- Windows/Linux `open` behavior — the opener plugin covers them, untested here.
