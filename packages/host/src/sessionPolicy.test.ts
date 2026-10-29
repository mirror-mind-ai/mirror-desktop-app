import { describe, expect, it } from "vitest";

import { type OpenSessionFacts, planOpen, SessionBusyError } from "./sessionPolicy.ts";
import { SessionFileRefusedError } from "./sessionIndex.ts";

const tomatoes = "/Users/test/.pi/agent/sessions/--Users-test-garden--/a.jsonl";
const roses = "/Users/test/.pi/agent/sessions/--Users-test-garden--/b.jsonl";

const open = (id: string, journey: string | undefined, file: string, streaming = false): OpenSessionFacts => ({
  id,
  ...(journey ? { journey } : {}),
  file,
  streaming,
});

describe("opening a session for a Journey", () => {
  it("closes nothing when the Journey has no open session", () => {
    expect(planOpen([open("s1", "beds", roses)], { journey: "garden" })).toEqual({ close: [] });
  });

  it("closes the Journey's open session first, whether the open is new or resumes a file", () => {
    const sessions = [open("s1", "garden", tomatoes), open("s2", "beds", "/Users/test/other.jsonl")];

    expect(planOpen(sessions, { journey: "garden" })).toEqual({ close: ["s1"] });
    expect(planOpen(sessions, { journey: "garden", file: roses })).toEqual({ close: ["s1"] });
    // Resuming the session it already has open: closed, then opened again from its file.
    expect(planOpen(sessions, { journey: "garden", file: tomatoes })).toEqual({ close: ["s1"] });
  });

  it("refuses while the Journey's open session is answering, closing nothing", () => {
    expect(() => planOpen([open("s1", "garden", tomatoes, true)], { journey: "garden", file: roses })).toThrow(SessionBusyError);
  });

  it("refuses a file another Journey, or a bare directory, has open", () => {
    expect(() => planOpen([open("s2", "beds", roses)], { journey: "garden", file: roses })).toThrow(SessionFileRefusedError);
    expect(() => planOpen([open("s3", undefined, roses)], { journey: "garden", file: roses })).toThrow(
      "That session is already open in this app.",
    );
  });

  it("leaves a bare directory's sessions alone: only a Journey has one open at a time", () => {
    expect(planOpen([open("s3", undefined, tomatoes)], {})).toEqual({ close: [] });
  });
});
