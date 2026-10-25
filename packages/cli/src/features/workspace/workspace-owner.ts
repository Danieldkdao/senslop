import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { workspaceStateDirectory } from "./runtime-paths.js";

export const processIsAlive = (pid: number) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

export class WorkspaceOwnedError extends Error {
  constructor() {
    super(
      "A workspace for this repository is already running. Use senslop app open to reuse it.",
    );
  }
}

export const withWorkspaceState = <T>(
  directory: string,
  repository: string,
  operation: (database: DatabaseSync, state: string) => T,
) => {
  const state = workspaceStateDirectory(directory, repository);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const path = join(state, "ownership.sqlite");
  const database = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    database.exec(
      "PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id = 1), pid INTEGER NOT NULL, token TEXT NOT NULL) STRICT; BEGIN IMMEDIATE;",
    );
    try {
      const value = operation(database, state);
      database.exec("COMMIT");
      return value;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
};

export const claimWorkspaceOwner = (directory: string, repository: string) => {
  const token = randomUUID();
  withWorkspaceState(directory, repository, (database, state) => {
    const existingOwner = database
      .prepare("SELECT pid FROM owner WHERE id = 1")
      .get();
    if (existingOwner && processIsAlive(Number(existingOwner.pid)))
      throw new WorkspaceOwnedError();
    const lock = join(state, "owner.lock");
    try {
      if (!existingOwner && processIsAlive(Number(readFileSync(lock, "utf8"))))
        throw new WorkspaceOwnedError();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    database
      .prepare(
        "INSERT INTO owner VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET pid = excluded.pid, token = excluded.token",
      )
      .run(process.pid, token);
    writeFileSync(lock, String(process.pid), { mode: 0o600 });
  });
  return {
    isCurrent: () =>
      withWorkspaceState(
        directory,
        repository,
        (database) =>
          database.prepare("SELECT token FROM owner WHERE id = 1").get()
            ?.token === token,
      ),
    release: () =>
      withWorkspaceState(directory, repository, (database, state) => {
        if (
          database.prepare("SELECT token FROM owner WHERE id = 1").get()
            ?.token !== token
        )
          return;
        database.prepare("DELETE FROM owner WHERE id = 1").run();
        const lock = join(state, "owner.lock");
        try {
          if (readFileSync(lock, "utf8") === String(process.pid))
            unlinkSync(lock);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }),
  };
};

export type WorkspaceOwner = ReturnType<typeof claimWorkspaceOwner>;
