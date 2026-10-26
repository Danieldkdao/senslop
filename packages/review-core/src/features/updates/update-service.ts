import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { backup } from "node:sqlite";
import {
  appUpdateSchema,
  type AppUpdateSchema,
  type InstallationKind,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";

const stableVersion = /^\d+\.\d+\.\d+$/;
export const compareReleaseVersions = (left: string, right: string) => {
  if (!stableVersion.test(left) || !stableVersion.test(right))
    throw new Error("Expected stable release versions.");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1;
  return 0;
};

export const checkRelease = async (
  current: string,
  request: typeof fetch = fetch,
): Promise<AppUpdateSchema> => {
  const initial = {
    current,
    latest: null,
    available: false,
    status: "unavailable" as const,
    checkedAt: new Date().toISOString(),
    installation: "unknown" as const,
  };
  try {
    const response = await request(
      "https://registry.npmjs.org/@senslop%2fcli/latest",
      {
        signal: AbortSignal.timeout(3000),
        redirect: "error",
        headers: { Accept: "application/json" },
      },
    );
    if (response.status === 404) return { ...initial, status: "unpublished" };
    if (!response.ok) return initial;
    const body = await response.text();
    if (body.length > 200000) return initial;
    const release = JSON.parse(body) as { name?: string; version?: string };
    if (
      release.name !== "@senslop/cli" ||
      !release.version ||
      !stableVersion.test(release.version)
    )
      return initial;
    const available = compareReleaseVersions(release.version, current) > 0;
    return {
      ...initial,
      latest: release.version,
      available,
      status: available ? "available" : "current",
    };
  } catch {
    return initial;
  }
};

export const cachedRelease = async (
  store: LocalStore,
  current: string,
  force = false,
) => {
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name='app_update_check'")
    .get();
  const cached = appUpdateSchema.safeParse(
    row ? JSON.parse(String(row.value)) : null,
  );
  if (
    !force &&
    cached.success &&
    cached.data.current === current &&
    Date.now() - Date.parse(cached.data.checkedAt) <
      (cached.data.status === "unavailable" ? 900000 : 21600000)
  )
    return cached.data;
  const update = await checkRelease(current);
  store.database
    .prepare(
      "INSERT INTO preferences VALUES ('app_update_check',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    )
    .run(JSON.stringify(update));
  return update;
};

export const detectInstallation = (entry: string): InstallationKind => {
  let resolved = entry;
  try {
    resolved = realpathSync(entry);
  } catch {}
  const path = resolved.replaceAll("\\", "/");
  if (/\/pnpm\/global\//.test(path)) return "pnpm";
  if (/\/(?:lib|npm)\/node_modules\/@senslop\/cli\//.test(path)) return "npm";
  if (/\/packages\/cli\//.test(path)) return "source";
  return "unknown";
};

export const updateArguments = (manager: "npm" | "pnpm", version: string) => {
  if (!stableVersion.test(version)) throw new Error("Invalid release version.");
  return manager === "npm"
    ? ["install", "--global", `@senslop/cli@${version}`]
    : ["add", "--global", `@senslop/cli@${version}`];
};

export const assertUpdateIdle = (store: LocalStore) => {
  for (const table of [
    "ai_jobs",
    "check_runs",
    "finding_verifications",
    "fix_tasks",
  ]) {
    const active = store.database
      .prepare(
        `SELECT 1 FROM ${table} WHERE json_extract(body,'$.status') IN ('queued','running','in-progress') LIMIT 1`,
      )
      .get();
    if (active)
      throw new Error("Finish or cancel active work before updating.");
  }
};

export const assertNoRunningApps = (databasePath: string) => {
  const directory = join(dirname(databasePath), "jobs");
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    let pid: number;
    try {
      pid = Number(
        JSON.parse(readFileSync(join(directory, entry, "session.json"), "utf8"))
          .pid,
      );
    } catch {
      continue;
    }
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") continue;
    }
    throw new Error(
      "Stop all running Senslop apps before installing an update.",
    );
  }
};

export const installRelease = async (
  store: LocalStore,
  databasePath: string,
  manager: InstallationKind,
  version: string,
) => {
  if (manager !== "npm" && manager !== "pnpm")
    throw new Error(
      "Update this source or archive installation using its original installation method.",
    );
  assertUpdateIdle(store);
  assertNoRunningApps(databasePath);
  await backup(store.database, `${databasePath}.before-update-${Date.now()}`);
  const args = updateArguments(manager, version);
  await new Promise<void>((resolve, reject) => {
    const done = (error: Error | null) => {
      if (error) reject(error);
      else resolve();
    };
    const child =
      process.platform === "win32"
        ? execFile(
            "cmd.exe",
            ["/d", "/s", "/c", `${manager} ${args.join(" ")}`],
            { timeout: 300000 },
            done,
          )
        : execFile(manager, args, { timeout: 300000 }, done);

    child.stdout?.pipe(process.stderr);
    child.stderr?.pipe(process.stderr);
  });
};
