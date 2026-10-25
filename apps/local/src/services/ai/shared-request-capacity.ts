import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { RequestCapacity } from "./types";
import { providerRateWindowMs } from "./constants";
import { aiSettingsSchema } from "../../features/agents/schemas";

export const readMachineConcurrency = (path: string) => {
  const database = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    const settings = database
      .prepare("SELECT value FROM preferences WHERE name = 'ai_settings'")
      .get();
    return settings
      ? (aiSettingsSchema.parse(JSON.parse(String(settings.value)))
          .machineConcurrency ?? 4)
      : 4;
  } finally {
    database.close();
  }
};

export class SharedRequestCapacity {
  private readonly database: DatabaseSync;

  constructor(
    path: string,
    private readonly machineConcurrency = 4,
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    const version = Number(
      this.database.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (version > 1) {
      this.database.close();
      throw new Error("Upgrade Senslop to use this shared capacity database.");
    }
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, pid INTEGER NOT NULL,
        concurrency INTEGER NOT NULL, machine_limit INTEGER NOT NULL,
        holds_slot INTEGER NOT NULL, started_at INTEGER
      ) STRICT;
      CREATE TABLE IF NOT EXISTS usage (
        id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, started_at INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS usage_endpoint ON usage(endpoint, started_at);
      PRAGMA user_version = 1;
    `);
  }

  private transaction = <T>(operation: () => T) => {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  };

  private prune = () => {
    this.database
      .prepare("DELETE FROM usage WHERE started_at <= ?")
      .run(Date.now() - providerRateWindowMs);
    for (const row of this.database
      .prepare("SELECT DISTINCT pid FROM requests")
      .all()) {
      try {
        process.kill(Number(row.pid), 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH")
          this.database
            .prepare("DELETE FROM requests WHERE pid = ?")
            .run(row.pid!);
      }
    }
  };

  acquire = async (
    endpoint: string,
    capacity: RequestCapacity,
    inputTokens: number,
    outputTokens: number,
    signal?: AbortSignal,
    reuseSlot = false,
  ) => {
    signal?.throwIfAborted();
    const machineConcurrency =
      capacity.machineConcurrency ?? this.machineConcurrency;
    if (
      !Number.isInteger(machineConcurrency) ||
      machineConcurrency < 1 ||
      !Number.isInteger(capacity.concurrency) ||
      capacity.concurrency < 1
    )
      throw new Error("Capacity limits must be positive integers.");
    if (
      !Number.isFinite(inputTokens) ||
      !Number.isFinite(outputTokens) ||
      inputTokens < 0 ||
      outputTokens < 0 ||
      inputTokens > (capacity.limits.inputTokensPerMinute ?? Infinity) ||
      outputTokens > (capacity.limits.outputTokensPerMinute ?? Infinity)
    )
      throw new Error("Request exceeds the shared token allowance per minute.");
    const id = randomUUID();
    this.database
      .prepare("INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, NULL)")
      .run(
        id,
        endpoint,
        process.pid,
        capacity.concurrency,
        machineConcurrency,
        reuseSlot ? 0 : 1,
      );
    let admitted = false;
    try {
      while (!admitted) {
        signal?.throwIfAborted();
        admitted = this.transaction(() => {
          this.prune();
          const active = this.database
            .prepare(
              "SELECT endpoint, concurrency, machine_limit FROM requests WHERE started_at IS NOT NULL AND holds_slot = 1",
            )
            .all();
          const matching = active.filter((row) => row.endpoint === endpoint);
          if (
            !reuseSlot &&
            (active.length >=
              Math.min(
                machineConcurrency,
                ...active.map((row) => Number(row.machine_limit)),
              ) ||
              matching.length >=
                Math.min(
                  capacity.concurrency,
                  ...matching.map((row) => Number(row.concurrency)),
                ))
          )
            return false;
          // Nested context calls reuse the parent slot and must not queue behind its blocked siblings.
          const first = this.database
            .prepare(
              "SELECT id FROM requests WHERE endpoint = ? AND started_at IS NULL AND holds_slot = 1 ORDER BY rowid LIMIT 1",
            )
            .get(endpoint);
          if (!reuseSlot && first?.id !== id) return false;
          const usage = this.database
            .prepare(
              "SELECT count(*) AS requests, coalesce(sum(input_tokens), 0) AS input, coalesce(sum(output_tokens), 0) AS output FROM usage WHERE endpoint = ?",
            )
            .get(endpoint)!;
          const limits = capacity.limits;
          if (
            Number(usage.requests) >= (limits.requestsPerMinute ?? Infinity) ||
            Number(usage.input) + inputTokens >
              (limits.inputTokensPerMinute ?? Infinity) ||
            Number(usage.output) + outputTokens >
              (limits.outputTokensPerMinute ?? Infinity)
          )
            return false;
          const now = Date.now();
          this.database
            .prepare("UPDATE requests SET started_at = ? WHERE id = ?")
            .run(now, id);
          this.database
            .prepare("INSERT INTO usage VALUES (?, ?, ?, ?, ?)")
            .run(
              id,
              endpoint,
              now,
              Math.ceil(inputTokens),
              Math.ceil(outputTokens),
            );
          return true;
        });
        if (!admitted) await sleep(100, undefined, { signal });
      }
      let released = false;
      return {
        release: (actualInput?: number, actualOutput?: number) => {
          if (released) return;
          released = true;
          this.transaction(() => {
            this.database.prepare("DELETE FROM requests WHERE id = ?").run(id);
            if (
              actualInput !== undefined &&
              Number.isFinite(actualInput) &&
              actualInput >= 0
            )
              this.database
                .prepare("UPDATE usage SET input_tokens = ? WHERE id = ?")
                .run(Math.ceil(actualInput), id);
            if (
              actualOutput !== undefined &&
              Number.isFinite(actualOutput) &&
              actualOutput >= 0
            )
              this.database
                .prepare("UPDATE usage SET output_tokens = ? WHERE id = ?")
                .run(Math.ceil(actualOutput), id);
          });
        },
      };
    } finally {
      if (!admitted)
        this.database.prepare("DELETE FROM requests WHERE id = ?").run(id);
    }
  };

  close = () => this.database.close();
}
