import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import type { LocalStore } from "../../db/local-store";

export const gitProcess = (
  repository: string,
  args: string[],
  options: {
    input?: string;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> =>
  new Promise((resolve, reject) => {
    // Git needs the user's credential helpers, SSH agent and configured signing environment.
    const child = execFile(
      "git",
      args,
      {
        cwd: repository,
        encoding: "utf8",
        maxBuffer: 25 * 1024 * 1024,
        timeout: 120000,
        signal: options.signal,
        env: { ...process.env, ...options.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) =>
        error
          ? reject(new Error((stderr || error.message).slice(-12000)))
          : resolve(stdout),
    );
    child.stdin?.end(options.input);
  });

export const validateGitPath = (path: string) => {
  if (
    !path ||
    isAbsolute(path) ||
    path.split(/[\\/]/).some((part) => part === ".." || part === ".git") ||
    path.includes("\0")
  )
    throw new Error("Select a repository-relative file path.");
  return path;
};

export const gitIdentity = (values: unknown) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");

export const withRepositoryLease = async <T>(
  store: LocalStore,
  repository: string,
  operation: () => Promise<T>,
) => {
  const common = (
    await gitProcess(repository, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ])
  ).trim();
  const owner = randomUUID();
  store.transaction(() => {
    const lease = store.database
      .prepare("SELECT pid FROM repository_leases WHERE repository=?")
      .get(common);
    if (lease) {
      let live = true;
      try {
        process.kill(Number(lease.pid), 0);
      } catch (error) {
        live = (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
      if (live)
        throw new Error(
          "Another repository operation is running. Retry when it finishes.",
        );
    }
    store.database
      .prepare(
        "INSERT INTO repository_leases VALUES (?,?,?) ON CONFLICT(repository) DO UPDATE SET owner=excluded.owner,pid=excluded.pid",
      )
      .run(common, owner, process.pid);
  });
  try {
    return await operation();
  } finally {
    store.database
      .prepare("DELETE FROM repository_leases WHERE repository=? AND owner=?")
      .run(common, owner);
  }
};

export const gitBlobDigest = (
  repository: string,
  revision: string,
  path: string,
): Promise<string | null> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const child = spawn("git", ["show", `${revision}:${path}`], {
      cwd: repository,
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.on("data", (bytes: Buffer) => hash.update(bytes));
    child.stderr.on("data", (bytes: Buffer) => {
      stderr = (stderr + bytes.toString()).slice(-12000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(hash.digest("hex"));
      else if (code === 128) resolve(null);
      else reject(new Error(stderr || "Git blob hashing failed."));
    });
  });
