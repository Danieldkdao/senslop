import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
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

const jobDirectory = (dataDirectory: string, repository: string) =>
  join(
    dataDirectory,
    "jobs",
    createHash("sha256").update(repository).digest("hex").slice(0, 20),
  );

export const workspacePort = async (
  dataDirectory: string,
  repository: string,
): Promise<number> => {
  const state = jobDirectory(dataDirectory, repository);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const path = join(state, "worker-port.json");
  try {
    const pid = Number(await readFile(join(state, "owner.lock"), "utf8"));
    process.kill(pid, 0);
    throw new Error(
      "A workspace for this repository is already running. Use its terminal or stop it first.",
    );
  } catch (error) {
    if (
      !["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")
    )
      throw error;
  }
  let savedPort: number | undefined;
  try {
    savedPort = z
      .number()
      .int()
      .min(1024)
      .max(65535)
      .parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
      flag: savedPort === undefined ? "wx" : "w",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return workspacePort(dataDirectory, repository);
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
}: LocalJobsOptions) => {
  const state = jobDirectory(dataDirectory, repository);
  const appId = basename(state);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const lock = join(state, "owner.lock");
  try {
    const pid = Number(await readFile(lock, "utf8"));
    try {
      process.kill(pid, 0);
      throw new Error(
        "A workspace for this repository is already running. Use its terminal or stop it first.",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await unlink(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  let keys: EngineKeysSchema;
  try {
    keys = engineKeysSchema.parse(
      JSON.parse(await readFile(join(state, "keys.json"), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await unlink(lock);
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
  const workerUrl = new URL(sdkUrl);
  workerUrl.searchParams.set("token", keys.workerToken);
  let ports: number[];
  try {
    ports = await Promise.all(Array.from({ length: 4 }, availablePort));
  } catch (error) {
    await unlink(lock);
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
      void unlink(lock)
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
