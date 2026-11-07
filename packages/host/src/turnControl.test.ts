import type { SessionEvent } from "@mirror-desktop/protocol";
import { describe, expect, it, vi } from "vitest";

import { SessionBusyError } from "./sessionPolicy.ts";
import { type Acceptance, acceptPrompt, inOrder, type PromptTarget, PromptRefusedError, stopTurn, type StopTarget } from "./turnControl.ts";

type PiPrompt = PromptTarget["prompt"];

/** A Pi session as accepting a prompt reads it: idle, with a model, unless told otherwise. */
function piSession(state: { streaming?: boolean; compacting?: boolean; provider?: string | null; prompt?: PiPrompt } = {}) {
  const calls: { text: string; options: Parameters<PiPrompt>[1] }[] = [];
  const session: PromptTarget & { isStreaming: boolean } = {
    isStreaming: state.streaming ?? false,
    isCompacting: state.compacting ?? false,
    model: state.provider === null ? undefined : { provider: state.provider ?? "anthropic" },
    prompt: (text, options) => {
      calls.push({ text, options });
      return state.prompt ? state.prompt(text, options) : Promise.resolve();
    },
  };
  return { session, calls };
}

function acceptance(overrides: Partial<Acceptance> = {}): Acceptance & { late: unknown[] } {
  const late: unknown[] = [];
  return { hasCredential: async () => true, onLateFailure: (cause) => late.push(cause), late, ...overrides };
}

/** A promise that never settles: Pi's prompt() runs for the whole run when it starts one. */
const forever = () => new Promise<void>(() => {});

describe("accepting a prompt", () => {
  it("answers what Pi did with it, from Pi's own preflight, without waiting for the run", async () => {
    for (const disposition of ["started", "queued", "handled"] as const) {
      const { session } = piSession({
        prompt: (_text, options) => {
          options.preflightResult?.(disposition);
          return forever();
        },
      });
      await expect(acceptPrompt(session, "Hello", undefined, acceptance())).resolves.toBe(disposition);
    }
  });

  it("answers deferred when Pi returns before its preflight: it put the prompt after the turn that was settling", async () => {
    let preflight: ((disposition: "started") => void) | undefined;
    const { session } = piSession({
      prompt: (_text, options) => {
        preflight = options.preflightResult;
        return Promise.resolve();
      },
    });
    await expect(acceptPrompt(session, "Keep it short", "steer", acceptance())).resolves.toBe("deferred");
    // The deferred call reaches its preflight later, and the answer already given stands.
    expect(() => preflight?.("started")).not.toThrow();
  });

  it("hands Pi the behavior it was given, and none when there is none", async () => {
    const { session, calls } = piSession({ streaming: true });
    await acceptPrompt(session, "Keep it short", "steer", acceptance());
    await acceptPrompt(session, "Then say done", "followUp", acceptance());
    session.isStreaming = false;
    await acceptPrompt(session, "Hello", undefined, acceptance());
    expect(calls.map(({ text, options }) => [text, options.streamingBehavior])).toEqual([
      ["Keep it short", "steer"],
      ["Then say done", "followUp"],
      ["Hello", undefined],
    ]);
    expect(calls[2]?.options).not.toHaveProperty("streamingBehavior");
  });

  it("refuses a prompt with no behavior while the session answers, before asking Pi", async () => {
    const { session, calls } = piSession({ streaming: true });
    await expect(acceptPrompt(session, "Hello", undefined, acceptance())).rejects.toBeInstanceOf(SessionBusyError);
    expect(calls).toEqual([]);
  });

  it("lets a steer or a follow-up through while the session answers, as Pi checks no model then", async () => {
    const hasCredential = vi.fn(async () => false);
    const { session, calls } = piSession({ streaming: true, provider: null });
    await acceptPrompt(session, "Keep it short", "steer", acceptance({ hasCredential }));
    expect(calls).toHaveLength(1);
    expect(hasCredential).not.toHaveBeenCalled();
  });

  it("refuses in the host's own words what Pi could not start, before asking Pi", async () => {
    const refusals = [
      [piSession({ provider: null }), acceptance(), "No model is selected for this session."],
      [piSession(), acceptance({ hasCredential: async () => false }), "No credential for anthropic: sign in first."],
      [piSession({ compacting: true }), acceptance(), "Pi is compacting the session; try again in a moment."],
    ] as const;
    for (const [{ session, calls }, context, words] of refusals) {
      const refused = await acceptPrompt(session, "Hello", "steer", context).catch((cause: unknown) => cause);
      expect(refused).toBeInstanceOf(PromptRefusedError);
      expect(refused).toMatchObject({ message: words });
      expect(calls).toEqual([]);
    }
  });

  it("rejects with Pi's own failure when Pi refuses before its preflight, and as busy when a run began meanwhile", async () => {
    const piFailure = new Error("Extension command \"/x\" failed: /Users/test/.pi/agent/extensions/x.ts");
    const { session } = piSession({ prompt: () => Promise.reject(piFailure) });
    await expect(acceptPrompt(session, "/x", undefined, acceptance())).rejects.toBe(piFailure);

    const racing = piSession({
      prompt: () => {
        racing.session.isStreaming = true;
        return Promise.reject(new Error("Agent is already processing."));
      },
    });
    await expect(acceptPrompt(racing.session, "Hello", undefined, acceptance())).rejects.toBeInstanceOf(SessionBusyError);
  });

  it("hands a failure after Pi accepted the prompt to the host's event, not to the answer", async () => {
    const runFailure = new Error("the run failed");
    const context = acceptance();
    const { session } = piSession({
      prompt: (_text, options) => {
        options.preflightResult?.("started");
        return Promise.reject(runFailure);
      },
    });
    await expect(acceptPrompt(session, "Hello", undefined, context)).resolves.toBe("started");
    await vi.waitFor(() => expect(context.late).toEqual([runFailure]));
  });
});

/** A Pi session as a stop reads it, with the events the host projects from it. */
function stoppable(initial: { steering?: string[]; followUp?: string[] } = {}) {
  const queue = { steering: [...(initial.steering ?? [])], followUp: [...(initial.followUp ?? [])] };
  const calls: string[] = [];
  const listeners = new Set<(event: SessionEvent) => void>();
  let finishAbort: () => void = () => {};
  let failAbort: (cause: unknown) => void = () => {};
  const session: StopTarget = {
    clearQueue: () => {
      calls.push("clearQueue");
      const taken = { steering: queue.steering.splice(0), followUp: queue.followUp.splice(0) };
      return taken;
    },
    abort: () => {
      calls.push("abort");
      return new Promise<void>((resolve, reject) => {
        finishAbort = resolve;
        failAbort = reject;
      });
    },
  };
  const observe = (listener: (event: SessionEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const emit = (event: SessionEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  return {
    session,
    observe,
    queue,
    calls,
    listeners,
    emit,
    finishAbort: () => finishAbort(),
    failAbort: (cause: unknown) => failAbort(cause),
  };
}

describe("stopping a turn", () => {
  it("withdraws the queue before it aborts and again after, and answers with what it withdrew", async () => {
    const stub = stoppable({ steering: ["a"], followUp: ["b"] });
    const stopping = stopTurn(stub.session, stub.observe);
    expect(stub.calls).toEqual(["clearQueue", "abort"]);
    stub.emit({ type: "agent_settled", aborted: true });
    await expect(stopping).resolves.toEqual({ steering: ["a"], followUp: ["b"] });
    expect(stub.calls).toEqual(["clearQueue", "abort", "clearQueue"]);
  });

  it("withdraws a message that queued after the first clear, while the run was still stopping", async () => {
    const stub = stoppable({ steering: ["a"] });
    const stopping = stopTurn(stub.session, stub.observe);
    // A steer whose input handlers were still running when Stop landed.
    stub.queue.steering.push("b");
    stub.queue.followUp.push("c");
    stub.finishAbort();
    await expect(stopping).resolves.toEqual({ steering: ["a", "b"], followUp: ["c"] });
  });

  it("keeps out a message Pi delivered while the stop landed, once for each delivery", async () => {
    const stub = stoppable({ steering: ["a", "a", "b"], followUp: ["b"] });
    const stopping = stopTurn(stub.session, stub.observe);
    // The loop had drained "a" before the clear; its echo comes after it.
    stub.emit({ type: "message_start", role: "user" });
    stub.emit({ type: "message_end", role: "user", text: "a" });
    stub.emit({ type: "message_end", role: "assistant", text: "", stopReason: "aborted", errorMessage: "Request was aborted" });
    stub.emit({ type: "message_end", role: "custom", text: "b" });
    stub.emit({ type: "agent_settled", aborted: true });
    await expect(stopping).resolves.toEqual({ steering: ["a", "b"], followUp: ["b"] });
  });

  it("answers when the stopped run settles, not when a run Pi started after it ends", async () => {
    const stub = stoppable({ followUp: ["b"] });
    const stopping = stopTurn(stub.session, stub.observe);
    // abort() waits until Pi is idle, and a prompt Pi deferred during the settle runs first.
    stub.emit({ type: "agent_settled", aborted: true });
    await expect(stopping).resolves.toEqual({ steering: [], followUp: ["b"] });
    stub.failAbort(new Error("late"));
  });

  it("answers at once on an idle session, with nothing withdrawn", async () => {
    const stub = stoppable();
    const stopping = stopTurn(stub.session, stub.observe);
    stub.finishAbort();
    await expect(stopping).resolves.toEqual({ steering: [], followUp: [] });
  });

  it("stops watching the session once it has answered", async () => {
    const stub = stoppable();
    const stopping = stopTurn(stub.session, stub.observe);
    expect(stub.listeners.size).toBe(1);
    stub.finishAbort();
    await stopping;
    expect(stub.listeners.size).toBe(0);
  });

  it("fails when Pi's abort fails before the run settles", async () => {
    const stub = stoppable({ steering: ["a"] });
    const stopping = stopTurn(stub.session, stub.observe);
    stub.failAbort(new Error("Pi could not stop"));
    await expect(stopping).rejects.toThrow("Pi could not stop");
    expect(stub.listeners.size).toBe(0);
  });
});

describe("one session's prompts and changes, in the order they came", () => {
  it("hands Pi a change sent before a prompt before that prompt, so the prompt runs on it", async () => {
    const order: string[] = [];
    const line = { tail: Promise.resolve() as Promise<unknown> };
    let finishCheck: () => void = () => {};
    // A change waits on Pi's credential check before it applies anything.
    const change = inOrder(line, async () => {
      await new Promise<void>((resolve) => (finishCheck = resolve));
      order.push("model changed");
      return "changed";
    });
    const prompt = inOrder(line, async () => {
      order.push("prompt");
      return "started";
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    finishCheck();
    await expect(change).resolves.toBe("changed");
    await expect(prompt).resolves.toBe("started");
    expect(order).toEqual(["model changed", "prompt"]);
  });

  it("keeps a refused change to its sender: the next prompt still goes", async () => {
    const line = { tail: Promise.resolve() as Promise<unknown> };
    const change = inOrder(line, async () => {
      throw new Error("No credential for faraway: sign in first.");
    });
    const prompt = inOrder(line, async () => "started");
    await expect(change).rejects.toThrow("No credential for faraway");
    await expect(prompt).resolves.toBe("started");
  });
});
