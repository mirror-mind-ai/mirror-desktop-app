import { chmod, mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  containedSessionFile,
  listSessions,
  SessionFileRefusedError,
  sessionFolderOf,
  SessionsUnreadableError,
} from "./sessionIndex.ts";

let agentDir: string;
const cwd = "/Users/test/garden";

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), "mirror-desktop-index-"));
});

afterEach(async () => {
  await chmod(sessionFolderOf(cwd, agentDir), 0o755).catch(() => undefined);
  await rm(agentDir, { recursive: true, force: true });
});

const header = (id: string, timestamp = "2026-10-01T09:00:00.000Z", sessionCwd = cwd) =>
  JSON.stringify({ type: "session", version: 3, id, timestamp, cwd: sessionCwd });
const user = (content: unknown) =>
  JSON.stringify({ type: "message", id: "u", parentId: null, timestamp: "2026-10-01T09:00:01.000Z", message: { role: "user", content, timestamp: 1 } });
const system = (content: string) =>
  JSON.stringify({ type: "message", id: "s", parentId: null, timestamp: "2026-10-01T09:00:00.500Z", message: { role: "system", content, timestamp: 1 } });
const named = (name: string) => JSON.stringify({ type: "session_info", id: "n", parentId: null, timestamp: "2026-10-01T09:00:00.700Z", name });

/** Write a session file into the Journey's folder, its file time set to `modifiedSeconds`. */
async function session(name: string, lines: string[], modifiedSeconds = 1_000): Promise<string> {
  const folder = sessionFolderOf(cwd, agentDir);
  await mkdir(folder, { recursive: true });
  const file = join(folder, name);
  await writeFile(file, `${lines.join("\n")}\n`);
  await utimes(file, modifiedSeconds, modifiedSeconds);
  return file;
}

describe("the folder a Journey's sessions are in", () => {
  it("is the folder Pi itself uses for the project path", () => {
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      // Pi's own folder for the cwd, from a manager that writes nothing until a message.
      expect(sessionFolderOf(cwd, agentDir)).toBe(SessionManager.create(cwd).getSessionDir());
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  });
});

describe("listing a Journey's sessions", () => {
  it("lists every session newest first, by the time its file last changed", async () => {
    const older = await session("a.jsonl", [header("s-old", "2026-09-01T08:00:00.000Z"), user("Plant the tomatoes")], 1_000);
    const newer = await session("b.jsonl", [header("s-new", "2026-10-01T09:00:00.000Z"), user("Water the beds")], 2_000);

    expect(await listSessions(cwd, agentDir)).toEqual([
      { file: newer, id: "s-new", title: "Water the beds", created: Date.parse("2026-10-01T09:00:00.000Z"), modified: 2_000_000 },
      { file: older, id: "s-old", title: "Plant the tomatoes", created: Date.parse("2026-09-01T08:00:00.000Z"), modified: 1_000_000 },
    ]);
  });

  it("titles a session by its first message, its text blocks joined and its whitespace folded, as Pi's list does", async () => {
    await session("a.jsonl", [
      header("s1"),
      user([
        { type: "text", text: "Plant\n\nthe" },
        { type: "image", data: "", mimeType: "image/png" },
        { type: "text", text: "tomatoes" },
      ]),
      user("A later message"),
    ]);

    expect((await listSessions(cwd, agentDir))[0]?.title).toBe("Plant the tomatoes");
  });

  it("titles a session by its name when the head of the file names it", async () => {
    await session("a.jsonl", [header("s1"), named("Tomatoes"), user("Plant the tomatoes")]);

    expect((await listSessions(cwd, agentDir))[0]?.title).toBe("Tomatoes");
  });

  it("misses a name given after the first message, which only a read of the whole file would find", async () => {
    await session("a.jsonl", [header("s1"), user("Plant the tomatoes"), named("Tomatoes")]);

    expect((await listSessions(cwd, agentDir))[0]?.title).toBe("Plant the tomatoes");
  });

  it("finds the first message past a long system prompt, and gives up on it past the head", async () => {
    await session("near.jsonl", [header("near"), system("x".repeat(100_000)), user("Plant the tomatoes")], 2_000);
    await session("far.jsonl", [header("far"), system("x".repeat(300_000)), user("Too far to read")], 1_000);

    expect((await listSessions(cwd, agentDir)).map((summary) => summary.title)).toEqual(["Plant the tomatoes", "Untitled session"]);
  });

  it("keeps a title to plain text of a bounded length: no control, bidi or zero-width characters", async () => {
    await session("a.jsonl", [header("s1"), user(`Plant\u0007 the\u202E tomatoes\u200B now ${"and water them ".repeat(20)}`)]);

    const title = (await listSessions(cwd, agentDir))[0]?.title ?? "";
    expect(title.startsWith("Plant the tomatoes now and water them")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it("titles a session with no message in its head as untitled", async () => {
    await session("a.jsonl", [header("s1")]);

    expect((await listSessions(cwd, agentDir))[0]?.title).toBe("Untitled session");
  });

  it("skips what is not a session: another kind of file, an empty file, a file whose first line is not a session header", async () => {
    await session("good.jsonl", [header("s1"), user("Plant the tomatoes")]);
    await session("notes.txt", [header("s2"), user("Not a session file")]);
    await session("empty.jsonl", []);
    await session("broken.jsonl", ["{not json", user("Broken")]);
    await session("headless.jsonl", [user("No header")]);

    expect((await listSessions(cwd, agentDir)).map((summary) => summary.id)).toEqual(["s1"]);
  });

  it("lists nothing for a project Pi has never run in, and creates no folder for it", async () => {
    expect(await listSessions("/Users/test/orchard", agentDir)).toEqual([]);
    expect(await folderExists("/Users/test/orchard")).toBe(false);
  });

  it("names a folder it cannot read, without its path", async () => {
    await session("a.jsonl", [header("s1"), user("Plant the tomatoes")]);
    await chmod(sessionFolderOf(cwd, agentDir), 0o000);

    const failure = await listSessions(cwd, agentDir).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SessionsUnreadableError);
    expect((failure as Error).message).toBe("The session folder could not be read: permission denied.");
    expect((failure as Error).message).not.toContain(agentDir);
  });
});

describe("a session file the host is asked to read or resume", () => {
  it("is accepted when it is one of the Journey's sessions, and named as listed", async () => {
    const file = await session("a.jsonl", [header("s1"), user("Plant the tomatoes")]);

    expect(await containedSessionFile(cwd, file, agentDir)).toBe(file);
  });

  it("is refused outside the Journey's folder: by a path, by `..`, by another project's folder, below the folder", async () => {
    await session("a.jsonl", [header("s1"), user("Plant the tomatoes")]);
    const elsewhere = join(agentDir, "elsewhere.jsonl");
    await writeFile(elsewhere, `${header("x")}\n`);
    const folder = sessionFolderOf(cwd, agentDir);
    const otherFolder = sessionFolderOf("/Users/test/beds", agentDir);
    await mkdir(otherFolder, { recursive: true });
    await writeFile(join(otherFolder, "b.jsonl"), `${header("b", undefined, "/Users/test/beds")}\n`);
    await mkdir(join(folder, "nested"), { recursive: true });
    await writeFile(join(folder, "nested", "c.jsonl"), `${header("c")}\n`);

    for (const file of [elsewhere, join(folder, "..", "..", "elsewhere.jsonl"), join(otherFolder, "b.jsonl"), join(folder, "nested", "c.jsonl")]) {
      await expect(containedSessionFile(cwd, file, agentDir)).rejects.toThrow("That file is not one of the Journey's sessions.");
    }
  });

  it("is refused when a link in the folder points outside it", async () => {
    await session("a.jsonl", [header("s1"), user("Plant the tomatoes")]);
    const outside = join(agentDir, "outside.jsonl");
    await writeFile(outside, `${header("x")}\n`);
    const link = join(sessionFolderOf(cwd, agentDir), "link.jsonl");
    await symlink(outside, link);

    await expect(containedSessionFile(cwd, link, agentDir)).rejects.toBeInstanceOf(SessionFileRefusedError);
  });

  it("is refused when it no longer exists, when it is empty, and when it is not a session file", async () => {
    const folder = sessionFolderOf(cwd, agentDir);
    await session("a.jsonl", [header("s1"), user("Plant the tomatoes")]);
    const empty = await session("empty.jsonl", []);
    await writeFile(empty, "");
    const text = await session("notes.txt", [header("s2")]);

    await expect(containedSessionFile(cwd, join(folder, "gone.jsonl"), agentDir)).rejects.toThrow("That session's file no longer exists.");
    await expect(containedSessionFile(cwd, empty, agentDir)).rejects.toThrow("That session's file is empty.");
    await expect(containedSessionFile(cwd, text, agentDir)).rejects.toThrow("That file is not one of the Journey's sessions.");
  });
});

function folderExists(projectPath: string): Promise<boolean> {
  return stat(sessionFolderOf(projectPath, agentDir)).then(
    () => true,
    () => false,
  );
}
