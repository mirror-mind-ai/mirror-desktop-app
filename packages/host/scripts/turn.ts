// One turn against the host, with timings — the spike-1 instrument.
//
// Spawns the host, opens a session for a working directory, sends one
// prompt, prints the stream as it arrives, waits for `agent_settled`, closes
// the session and the host, and reports how long each stage took:
//
//   npm run turn --workspace packages/host -- [--cwd <dir>] [--prompt "<text>"]
//                                            [--node <binary>] [--entry <main.ts>]
//
// `--node` and `--entry` point it at another runtime and host — the embedded
// sidecar and the staged host inside a bundle — so a bundle can be driven
// from the terminal with a bare PATH, exactly as a clean machine would run it.
//
// It is the same path the UI will take; what it measures is what the person
// will feel.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ClientRequest,
  type HostEvent,
  HostMessage,
  type HostResultBody,
  PROTOCOL_VERSION,
} from "@mirror-desktop/protocol";
import WebSocket from "ws";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const journey = option("--journey");
const cwd = option("--cwd") ?? (journey ? undefined : process.cwd());
const promptText = option("--prompt") ?? "Reply with the single word: pong";

const HOST_ENTRY = option("--entry") ?? fileURLToPath(new URL("../src/main.ts", import.meta.url));
const NODE = option("--node") ?? process.execPath;
const token = randomBytes(16).toString("hex");
const t0 = performance.now();
const since = (): string => `${(performance.now() - t0).toFixed(0).padStart(6)} ms`;

// stdin is a pipe held open on purpose: the host shuts down when it closes,
// which is how the shell's death reaches it.
const host = spawn(NODE, [HOST_ENTRY], {
  env: { ...process.env, MIRROR_HOST_TOKEN: token },
  stdio: ["pipe", "pipe", "pipe"],
});
host.stderr.on("data", (chunk: Buffer) => process.stderr.write(`[host] ${chunk}`));
host.on("exit", (code) => console.log(`${since()}  host exited (${code})`));

const port = await new Promise<number>((resolve) => {
  host.stdout.once("data", (chunk: Buffer) => {
    resolve((JSON.parse(chunk.toString().trim()) as { port: number }).port);
  });
});
console.log(`${since()}  host listening on ${port}`);

const socket = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise<void>((resolve) => socket.once("open", resolve));

let nextId = 1;
const pending = new Map<string, (message: HostMessage) => void>();
let onEvent: (message: HostEvent) => void = () => {};

socket.on("message", (raw) => {
  const message = HostMessage.parse(JSON.parse(raw.toString()));
  if ("id" in message) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  } else {
    onEvent(message);
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

const hello = await request({ type: "hello", token, protocolVersion: PROTOCOL_VERSION }, "hello");
console.log(`${since()}  hello: node ${hello.host.node}, pi ${hello.host.pi}, mirror ${hello.host.mirror}`);

const opened = await request(
  { type: "session.open", ...(journey ? { journey } : {}), ...(cwd ? { cwd } : {}) },
  "session.open",
);
console.log(
  `${since()}  session open: ${opened.sessionId} (${opened.model?.provider}/${opened.model?.id}, thinking ${opened.thinkingLevel})`,
);
console.log(`           session file: ${opened.sessionFile}`);
console.log(`           cwd: ${opened.cwd}`);
if (opened.journey) console.log(`           journey: ${opened.journey} · mirror conversation ${opened.mirrorConversationId ?? "(unbound)"}`);
for (const line of opened.diagnostics) console.log(`           ⚠ ${line}`);

const settled = new Promise<void>((resolve) => {
  let firstDeltaAt: number | undefined;
  let streaming = false;
  onEvent = (message) => {
    if (message.type !== "session.event") {
      console.log(`${since()}  ${message.type}: ${JSON.stringify(message)}`);
      return;
    }
    const event = message.event;
    switch (event.type) {
      case "text_delta":
        if (firstDeltaAt === undefined) {
          firstDeltaAt = performance.now();
          console.log(`${since()}  first text delta`);
          process.stdout.write("           │ ");
        }
        streaming = true;
        process.stdout.write(event.delta.replaceAll("\n", "\n           │ "));
        break;
      case "thinking_delta":
        break;
      case "tool_start":
        if (streaming) process.stdout.write("\n");
        streaming = false;
        console.log(`${since()}  tool ${event.toolName} ${JSON.stringify(event.args).slice(0, 120)}`);
        break;
      case "tool_end":
        console.log(`${since()}  tool ${event.toolName} ${event.isError ? "failed" : "done"} in ${event.durationMs ?? "?"} ms`);
        break;
      case "message_end":
        if (streaming) process.stdout.write("\n");
        streaming = false;
        console.log(
          `${since()}  message_end ${event.role}${event.stopReason ? ` (${event.stopReason})` : ""}${event.errorMessage ? ` — ${event.errorMessage}` : ""}`,
        );
        break;
      case "agent_settled":
        console.log(`${since()}  agent settled${event.aborted ? " (aborted)" : ""}`);
        resolve();
        break;
      default:
        console.log(`${since()}  ${event.type}`);
    }
  };
});

const promptSentAt = performance.now();
await request({ type: "session.prompt", sessionId: opened.sessionId, text: promptText }, "session.prompt");
console.log(`${since()}  prompt accepted`);
await settled;
console.log(`           turn took ${(performance.now() - promptSentAt).toFixed(0)} ms from prompt to settled`);

await request({ type: "session.close", sessionId: opened.sessionId }, "session.close");
console.log(`${since()}  session closed`);
socket.close();
host.stdin.end();
