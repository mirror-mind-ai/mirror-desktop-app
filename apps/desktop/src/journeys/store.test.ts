import type { ClientRequestBody, HostResultBody, Journey } from "@mirror-desktop/protocol";
import { beforeEach, describe, expect, it } from "vitest";

import { type HostConnection, HostRequestError } from "../host/client.ts";
import { resetAllStores } from "../stores/registry.ts";
import { loadJourneys, useJourneys } from "./store.ts";

const garden: Journey = { id: "garden", name: "Garden", status: "active", description: "", projectPath: "/Users/test/garden" };

function stubHost(answer: (body: ClientRequestBody) => Promise<HostResultBody>): HostConnection {
  return { onEvent: () => {}, close: () => {}, request: answer };
}

beforeEach(() => resetAllStores());

describe("loading the Journeys", () => {
  it("is loading until the host lists them, then holds what it listed", async () => {
    let answer: (result: HostResultBody) => void = () => {};
    const client = stubHost(() => new Promise((resolve) => (answer = resolve)));
    const loading = loadJourneys(client);
    expect(useJourneys.getState()).toEqual({ status: "loading" });
    answer({ type: "journeys.list", journeys: [garden] });
    await loading;
    expect(useJourneys.getState()).toEqual({ status: "loaded", journeys: [garden] });
  });

  it("keeps the host's error code and words when the list fails", async () => {
    const client = stubHost(async () => {
      throw new HostRequestError("mirror_not_configured", "No Mirror home is configured on this machine yet.");
    });
    await loadJourneys(client);
    expect(useJourneys.getState()).toEqual({
      status: "failed",
      code: "mirror_not_configured",
      message: "No Mirror home is configured on this machine yet.",
    });
  });

  it("names a failure that is not the host's as an internal one", async () => {
    const client = stubHost(async () => {
      throw new Error("The socket closed.");
    });
    await loadJourneys(client);
    expect(useJourneys.getState()).toEqual({ status: "failed", code: "internal_failure", message: "The socket closed." });
  });

  it("lets the newest load win when an older one answers last", async () => {
    const answers: ((result: HostResultBody) => void)[] = [];
    const client = stubHost(() => new Promise((resolve) => answers.push(resolve)));
    const older = loadJourneys(client);
    const newer = loadJourneys(client);
    answers[1]?.({ type: "journeys.list", journeys: [garden] });
    await newer;
    answers[0]?.({ type: "journeys.list", journeys: [] });
    await older;
    expect(useJourneys.getState()).toEqual({ status: "loaded", journeys: [garden] });
  });

  it("writes nothing from a load that was still waiting when the stores were reset", async () => {
    let answer: (result: HostResultBody) => void = () => {};
    const client = stubHost(() => new Promise((resolve) => (answer = resolve)));
    const loading = loadJourneys(client);
    resetAllStores();
    answer({ type: "journeys.list", journeys: [garden] });
    await loading;
    expect(useJourneys.getState()).toEqual({ status: "loading" });
  });
});
