// The host's seam to the Mirror core: configuration, the database, Journeys,
// and the one write that binds a session to a Journey.
//
// Reads go through the core's own modules, in-process, on a read-only
// handle. The write — binding a Pi session's conversation to a Journey —
// goes through the front door (`mirror mirror load --journey … --session-id …`),
// the same command the `/mm-mirror` skill runs, so the desktop binds a
// session exactly as a terminal does and the core keeps the authority.
//
// Two imports reach past `ts/src/index.ts`, the core's declared public
// surface: `resolveDbPath` (frontDoor/dbPath.ts) and `listJourneyDtos`
// (mcp/readModels.ts), plus `getRuntimeSession` (mirror/runtimeSession.ts).
// They are the read models the desktop needs and the core has not exported
// yet; this file is the only place that knows it, and the Core-owned
// prerequisites in docs/project/history/predecessor.md name them.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { expandHome, openDatabaseReadOnly } from "mirror-mind/ts/src/index.ts";
import { MirrorHomeNotConfiguredError, resolveDbPath } from "mirror-mind/ts/src/frontDoor/dbPath.ts";
import { listJourneyDtos } from "mirror-mind/ts/src/mcp/readModels.ts";
import { getRuntimeSession } from "mirror-mind/ts/src/mirror/runtimeSession.ts";
import { loadConfiguration } from "mirror-mind/ts/src/runtime/config.ts";

const MIRROR_CLI = fileURLToPath(import.meta.resolve("mirror-mind/ts/src/frontDoor/cli.ts"));
const MIRROR_BIN = fileURLToPath(import.meta.resolve("mirror-mind/bin/mirror.js"));

const run = promisify(execFile);

export class MirrorNotConfiguredError extends Error {
  override readonly name = "MirrorNotConfiguredError";
}

export class JourneyNotFoundError extends Error {
  override readonly name = "JourneyNotFoundError";
}

export class JourneyHasNoProjectPathError extends Error {
  override readonly name = "JourneyHasNoProjectPathError";
}

export interface Journey {
  id: string;
  name: string;
  status: string;
  description: string;
  projectPath?: string;
  parent?: string;
}

/**
 * Fill the environment from Mirror's own configuration files — the user's
 * `~/.config/mirror/env` and a checkout's `.env` — exactly as the front door
 * does, so the host, the extension and every `mirror` the agent runs agree
 * on which Mirror they talk to. A bundled app launched from the Finder has
 * no `MIRROR_USER` in its environment; this is where it comes from.
 */
export function loadMirrorConfiguration(): void {
  loadConfiguration({ entryPath: MIRROR_CLI });
}

/** The database the front door would open; throws when no Mirror home is configured. */
export function mirrorDatabasePath(): string {
  try {
    return resolveDbPath([], process.env);
  } catch (cause) {
    if (cause instanceof MirrorHomeNotConfiguredError) {
      throw new MirrorNotConfiguredError("No Mirror home is configured on this machine yet.", { cause });
    }
    throw cause;
  }
}

function withReadOnlyDatabase<T>(read: (db: ReturnType<typeof openDatabaseReadOnly>) => T): T {
  const db = openDatabaseReadOnly(mirrorDatabasePath());
  try {
    return read(db);
  } finally {
    db.close();
  }
}

export function listJourneys(): Journey[] {
  return withReadOnlyDatabase((db) =>
    listJourneyDtos(db).map((dto) => {
      const projectPath = dto.metadata.project_path;
      const parent = dto.metadata.parent_journey;
      return {
        id: dto.id,
        name: dto.name,
        status: dto.status,
        description: dto.description,
        ...(typeof projectPath === "string" && projectPath ? { projectPath: expandHome(projectPath) } : {}),
        ...(typeof parent === "string" && parent ? { parent } : {}),
      };
    }),
  );
}

/** The directory a Journey's sessions run in. */
export function journeyProjectPath(journeyId: string): string {
  const journey = listJourneys().find((candidate) => candidate.id === journeyId);
  if (!journey) throw new JourneyNotFoundError(`No Journey '${journeyId}'.`);
  if (!journey.projectPath) {
    throw new JourneyHasNoProjectPathError(`Journey '${journeyId}' has no project path yet.`);
  }
  return journey.projectPath;
}

/** The Mirror conversation a Pi session is bound to, once something bound it. */
export function conversationForSession(sessionFile: string): string | undefined {
  return withReadOnlyDatabase((db) => getRuntimeSession(db, sessionFile)?.conversationId ?? undefined);
}

export interface JourneyBinding {
  /** The rendered Mirror Mode context: identity, Journey, memories, extension sections. */
  context: string;
  /** What the front door said on stderr (the banner, a detected Journey); diagnostics only. */
  notes: string;
}

/**
 * Bind a Pi session to a Journey the way a terminal does: `mirror mirror load`
 * names the session, so the core binds that session's conversation to the
 * Journey (creating it if the session has none yet) and activates Mirror
 * Mode. The context it prints is returned for the session's system prompt.
 */
export async function bindSessionToJourney(sessionFile: string, journeyId: string): Promise<JourneyBinding> {
  const { stdout, stderr } = await run(
    process.execPath,
    [MIRROR_BIN, "mirror", "load", "--journey", journeyId, "--session-id", sessionFile],
    {
      env: { ...process.env, MIRROR_SESSION_ID: sessionFile },
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return { context: stdout, notes: stderr.trim() };
}
