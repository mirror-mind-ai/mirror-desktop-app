// Drive a provider sign-in through the host from the terminal — the spike-3
// instrument.
//
//   npm run login --workspace packages/host -- --provider anthropic --type api_key --secret sk-…
//   npm run login --workspace packages/host -- --provider anthropic --type oauth --select browser [--open] [--cancel-on-url]
//
// Lists the providers before and after, prints every event and prompt the
// flow raises, answers `secret` prompts with `--secret` and `select` prompts
// with `--select`, opens the browser for `auth_url` when `--open` is given,
// and with `--cancel-on-url` cancels the flow as soon as the URL arrives —
// enough to prove the mechanics without a person in a browser. Run with a
// scratch HOME to see a fresh machine: `HOME=/tmp/fresh npm run login …`.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { ClientRequest, type HostEvent, HostMessage, type HostResultBody, PROTOCOL_VERSION } from "@mirror-desktop/protocol";
import WebSocket from "ws";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flag = (name: string): boolean => args.includes(name);
const providerId = option("--provider") ?? "anthropic";
const authType = option("--type") === "oauth" ? "oauth" : "api_key";
const secret = option("--secret");
const select = option("--select");

const HOST_ENTRY = option("--entry") ?? fileURLToPath(new URL("../src/main.ts", import.meta.url));
const NODE = option("--node") ?? process.execPath;
const token = randomBytes(16).toString("hex");

const host = spawn(NODE, [HOST_ENTRY], {
  env: { ...process.env, MIRROR_HOST_TOKEN: token },
  stdio: ["pipe", "pipe", "pipe"],
});
host.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[host] ${chunk}`));
const port = await new Promise<number>((resolve) => {
  host.stdout.once("data", (chunk: Buffer) => resolve((JSON.parse(chunk.toString().trim()) as { port: number }).port));
});

const socket = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise<void>((resolve) => socket.once("open", resolve));
let nextId = 1;
const pending = new Map<string, (message: HostMessage) => void>();
socket.on("message", (raw) => {
  const message = HostMessage.parse(JSON.parse(raw.toString()));
  if ("id" in message) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  } else {
    void onEvent(message);
  }
});

async function request<T extends HostResultBody["type"]>(
  body: ClientRequest["request"],
  expected: T,
): Promise<Extract<HostResultBody, { type: T }>> {
  const id = String(nextId++);
  const response = await new Promise<HostMessage>((resolve) => {
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, request: body }));
  });
  if (!("id" in response)) throw new Error("expected a response");
  if (response.error) throw new Error(`${body.type} failed: ${response.error.code} — ${response.error.message}`);
  if (response.result?.type !== expected) throw new Error(`${body.type}: unexpected result ${response.result?.type}`);
  return response.result as Extract<HostResultBody, { type: T }>;
}

async function onEvent(message: HostEvent): Promise<void> {
  switch (message.type) {
    case "auth.event": {
      const event = message.event;
      if (event.type === "auth_url") {
        console.log(`  → auth_url ${event.url.slice(0, 90)}…`);
        if (event.instructions) console.log(`    ${event.instructions}`);
        if (flag("--open")) spawn("open", [event.url], { stdio: "ignore" }).unref();
        if (flag("--cancel-on-url")) {
          console.log("  → cancelling (--cancel-on-url)");
          await request({ type: "auth.cancel", providerId }, "auth.cancel");
        }
      } else if (event.type === "device_code") {
        console.log(`  → device code ${event.userCode} at ${event.verificationUri}`);
      } else {
        console.log(`  → ${event.type}: ${event.message}`);
      }
      return;
    }
    case "auth.prompt": {
      const prompt = message.prompt;
      console.log(`  ? ${prompt.type}: ${prompt.message}`);
      if (prompt.type === "select") {
        for (const choice of prompt.options) console.log(`      - ${choice.id}: ${choice.label}`);
        if (select) await request({ type: "auth.answer", promptId: message.promptId, value: select }, "auth.answer");
      } else if (prompt.type === "secret" && secret) {
        await request({ type: "auth.answer", promptId: message.promptId, value: secret }, "auth.answer");
        console.log("    (answered with --secret)");
      } else if (prompt.type === "manual_code") {
        console.log("    (waiting for the browser callback; nothing to answer here)");
      }
      return;
    }
    case "auth.prompt_closed":
      console.log(`  × prompt ${message.promptId} closed`);
      return;
    default:
      return;
  }
}

function describe(providers: Awaited<ReturnType<typeof request<"auth.providers">>>["providers"]): void {
  for (const provider of providers) {
    const methods = [provider.oauth ? `oauth(${provider.oauth.label})` : null, provider.apiKey ? "api_key" : null]
      .filter(Boolean)
      .join(", ");
    const state = provider.signedIn ? `signed in via ${provider.signedIn.authType}${provider.signedIn.source ? ` (${provider.signedIn.source})` : ""}` : "not signed in";
    console.log(`  ${provider.id.padEnd(16)} ${state.padEnd(36)} ${methods}`);
  }
}

await request({ type: "hello", token, protocolVersion: PROTOCOL_VERSION }, "hello");
console.log(`HOME=${process.env.HOME}`);
console.log("providers before:");
describe((await request({ type: "auth.providers" }, "auth.providers")).providers.filter((p) => p.id === providerId || p.signedIn));

console.log(`login ${providerId} via ${authType}:`);
try {
  await request({ type: "auth.login", providerId, authType }, "auth.login");
  console.log("  ✓ signed in");
} catch (error) {
  console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
}

console.log("providers after:");
describe((await request({ type: "auth.providers" }, "auth.providers")).providers.filter((p) => p.id === providerId || p.signedIn));
const models = (await request({ type: "models.available" }, "models.available")).models;
console.log(`models available: ${models.length}${models.length ? ` (e.g. ${models.slice(0, 3).map((m) => `${m.provider}/${m.id}`).join(", ")})` : ""}`);

socket.close();
host.stdin.end();
