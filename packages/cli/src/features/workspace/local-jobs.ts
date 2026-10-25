import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { workspaceStateDirectory } from "./runtime-paths.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  claimWorkspaceOwner,
  processIsAlive,
  WorkspaceOwnedError,
  type WorkspaceOwner,
} from "./workspace-owner.js";
import { createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

export const availablePort = (port = 0) =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return server.close(() =>
          reject(new Error("No local port available.")),
        );
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

export const workspacePort = async (
  dataDirectory: string,
  repository: string,
  owner?: WorkspaceOwner,
): Promise<number> => {
  const state = workspaceStateDirectory(dataDirectory, repository);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const path = join(state, "worker-port.json");
  if (!owner?.isCurrent()) {
    try {
      const pid = Number(await readFile(join(state, "owner.lock"), "utf8"));
      if (processIsAlive(pid)) throw new WorkspaceOwnedError();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  let savedPort: number | undefined;
  let savedRecord = false;
  try {
    const saved = await readFile(path, "utf8");
    savedRecord = true;
    savedPort = z.number().int().min(1024).max(65535).parse(JSON.parse(saved));
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(error instanceof SyntaxError) &&
      !(error instanceof z.ZodError)
    )
      throw error;
  }
  if (savedPort !== undefined) {
    try {
      return await availablePort(savedPort);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  const port = await availablePort();
  try {
    await writeFile(path, JSON.stringify(port), {
      flag: savedRecord ? "w" : "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return workspacePort(dataDirectory, repository, owner);
  }
  return port;
};

const engineKeysSchema = z.object({
  workerToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  eventKey: z.string().regex(/^[a-f0-9]{64}$/),
  signingKey: z.string().regex(/^[a-f0-9]{64}$/),
});
type EngineKeysSchema = z.infer<typeof engineKeysSchema>;

type LocalJobsOptions = {
  dataDirectory: string;
  repository: string;
  sdkUrl: string;
  enginePath?: string;
  signal?: AbortSignal;
  owner?: WorkspaceOwner;
};

export const startLocalJobs = async ({
  dataDirectory,
  repository,
  sdkUrl,
  enginePath = join(
    dirname(createRequire(import.meta.url).resolve("inngest-cli/package.json")),
    "bin",
    process.platform === "win32" ? "inngest.exe" : "inngest",
  ),
  signal,
  owner,
}: LocalJobsOptions) => {
  const state = workspaceStateDirectory(dataDirectory, repository);
  const appId = basename(state);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const ownership = owner ?? claimWorkspaceOwner(dataDirectory, repository);
  const releaseOwner = () => {
    if (!owner) ownership.release();
  };
  let keys: EngineKeysSchema;
  let ports: number[];
  let workerUrl: URL;
  try {
    try {
      keys = engineKeysSchema.parse(
        JSON.parse(await readFile(join(state, "keys.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      keys = {
        workerToken: randomBytes(32).toString("hex"),
        eventKey: randomBytes(32).toString("hex"),
        signingKey: randomBytes(32).toString("hex"),
      };
      await writeFile(join(state, "keys.json"), JSON.stringify(keys), {
        flag: "wx",
        mode: 0o600,
      });
    }
    if (!keys.workerToken) {
      keys.workerToken = randomBytes(32).toString("hex");
      await writeFile(join(state, "keys.json"), JSON.stringify(keys), {
        mode: 0o600,
      });
    }
    workerUrl = new URL(sdkUrl);
    workerUrl.searchParams.set("token", keys.workerToken);
    ports = await Promise.all(Array.from({ length: 4 }, availablePort));
  } catch (error) {
    releaseOwner();
    throw error;
  }
  const baseUrl = `http://127.0.0.1:${ports[0]}`;
  const env = {
    INNGEST_BASE_URL: baseUrl,
    INNGEST_EVENT_KEY: keys.eventKey,
    INNGEST_SIGNING_KEY: keys.signingKey,
    SENSLOP_INNGEST_APP_ID: appId,
    SENSLOP_LOCAL_WORKER_TOKEN: keys.workerToken,
  };
  // Only explicit engine configuration is inherited; provider and cloud keys stay outside this process.
  const child = fork(
    fileURLToPath(new URL("./engine-supervisor.mjs", import.meta.url)),
    [
      enginePath,
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(ports[0]),
      "--connect-gateway-port",
      String(ports[1]),
      "--connect-gateway-grpc-port",
      String(ports[2]),
      "--connect-executor-grpc-port",
      String(ports[3]),
      "--sqlite-dir",
      state,
      "--sdk-url",
      workerUrl.href,
      "--poll-interval",
      "2",
      "--log-level",
      "error",
    ],
    {
      cwd: state,
      env: {
        INNGEST_EVENT_KEY: keys.eventKey,
        INNGEST_SIGNING_KEY: keys.signingKey,
        INNGEST_DEV: "0",
      },
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  let stopping = false;
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      Promise.resolve()
        .then(releaseOwner)
        .catch(() => {})
        .finally(() =>
          stopping
            ? resolve()
            : reject(
                new Error(
                  `Local Inngest exited (${code}). Restart the workspace.`,
                ),
              ),
        );
    });
  });
  void closed.catch(() => {});
  const stop = async () => {
    if (!stopping) {
      stopping = true;
      child.kill("SIGTERM");
    }
    await closed;
  };
  const abort = () => {
    void stop().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  void closed
    .finally(() => signal?.removeEventListener("abort", abort))
    .catch(() => {});
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(500),
      }).catch(() => null);
      if (response?.ok) return { env, stop, closed };
      await Promise.race([sleep(100), closed]);
    }
    throw new Error(
      "Local Inngest did not start. Reinstall the CLI to restore its bundled engine.",
    );
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
};
