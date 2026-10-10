import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  MAX_SNAPSHOT_BYTES,
  PROTOCOL_VERSION,
  previewUploadSchema,
  localPreviewSchema,
} from "@senslop/contracts";

import { resolveRepository } from "@senslop/review-core/git";
import { serverEnv } from "../../data/env/server.js";

type LocalAppOptions = {
  repository?: string;
  dataDirectory?: string;
  development?: boolean;
  appDirectory?: string;
  serverPath?: string;
  signal?: AbortSignal;
  startupTimeout?: number;
};

const availablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return server.close(() =>
          reject(new Error("No local port available.")),
        );
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

export const applicationDataDirectory = () => {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Senslop");
    case "win32":
      return join(
        serverEnv.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Senslop",
      );
    default:
      return join(
        serverEnv.XDG_DATA_HOME && isAbsolute(serverEnv.XDG_DATA_HOME)
          ? serverEnv.XDG_DATA_HOME
          : join(homedir(), ".local", "share"),
        "senslop",
      );
  }
};

export const startLocalApp = async ({
  repository = process.cwd(),
  dataDirectory,
  development = false,
  appDirectory,
  serverPath = fileURLToPath(
    new URL("./local-app/apps/local/server.js", import.meta.url),
  ),
  signal,
  startupTimeout = 30000,
}: LocalAppOptions = {}) => {
  const repositoryRoot = await resolveRepository(repository);
  const userData = dataDirectory ?? applicationDataDirectory();
  let cwd = dirname(serverPath);
  let entry = serverPath;
  try {
    if (development) {
      cwd =
        appDirectory ??
        dirname(
          createRequire(import.meta.url).resolve("@senslop/local/package.json"),
        );
      await access(join(cwd, "package.json"));
      entry = createRequire(join(cwd, "package.json")).resolve(
        "next/dist/bin/next",
      );
    }
    await access(entry);
  } catch {
    throw new Error(
      development
        ? "Development mode requires a Senslop source checkout with dependencies installed. Run pnpm install in the checkout."
        : "The local Next.js app is missing from this CLI bundle. Rebuild or reinstall Senslop.",
    );
  }
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "senslop-workspace-"));
  await chmod(directory, 0o700);
  const snapshotPath = join(directory, "preview.json");
  const token = randomBytes(32).toString("hex");
  let port: number;
  try {
    port = await availablePort();
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const origin = `http://127.0.0.1:${port}`;
  // A runtime launcher must construct process env; never pass cloud secrets or ambient Node hooks.
  const env = Object.fromEntries(
    [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "TZ",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_RUNTIME_DIR",
      "DISPLAY",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
  );
  const parentModule = fileURLToPath(
    new URL("./parent-monitor.mjs", import.meta.url),
  );
  const args = development
    ? ["dev", "--hostname", "127.0.0.1", "--port", String(port)]
    : [];
  const child = fork(entry, args, {
    cwd,
    env: {
      ...env,
      NODE_ENV: development ? "development" : "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      SENSLOP_LOCAL_ORIGIN: origin,
      SENSLOP_LOCAL_TOKEN: token,
      SENSLOP_LOCAL_SNAPSHOT: snapshotPath,
      SENSLOP_LOCAL_REPOSITORY: repositoryRoot,
      SENSLOP_LOCAL_DATABASE: join(userData, "reviews.sqlite"),
    },
    execArgv: ["--import", pathToFileURL(parentModule).href],
    stdio: ["ignore", development ? "pipe" : "ignore", "pipe", "ipc"],
  });
  child.stdout?.on("data", (chunk) => process.stderr.write(chunk));
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
    if (development) process.stderr.write(chunk);
  });
  let stopping = false;
  let ended = false;
  let write = Promise.resolve();
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const closed = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  void closed.catch(() => {});
  const cleanup = async (error?: Error) => {
    if (ended) return;
    ended = true;
    signal?.removeEventListener("abort", onAbort);
    await write.catch(() => {});
    await rm(directory, { recursive: true, force: true });
    if (error) fail(error);
    else finish();
  };
  child.once("error", (error) => void cleanup(error).catch(fail));
  child.once(
    "exit",
    (code, exitSignal) =>
      void cleanup(
        stopping
          ? undefined
          : new Error(
              `Local app exited unexpectedly (${code ?? exitSignal}). ${stderr.trim()}`,
            ),
      ).catch(fail),
  );
  const stop = async () => {
    if (!stopping && !ended) {
      stopping = true;
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 5000);
      force.unref();
      try {
        await closed;
      } finally {
        clearTimeout(force);
      }
    } else await closed;
  };
  const onAbort = () => {
    void stop().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const setSnapshot = (snapshot: unknown) => {
    const data = previewUploadSchema.parse({
      ...(snapshot as object),
      protocolVersion: PROTOCOL_VERSION,
    });
    const body = JSON.stringify(
      localPreviewSchema.parse({
        ...data,
        id: randomUUID(),
        repositoryFingerprint: (
          snapshot as { repositoryFingerprint?: string | null }
        ).repositoryFingerprint,
      }),
    );
    if (Buffer.byteLength(body) > MAX_SNAPSHOT_BYTES)
      throw new Error(
        "Inspection exceeds the 20 MiB snapshot limit. Choose a smaller selection.",
      );
    write = write
      .catch(() => {})
      .then(async () => {
        if (stopping || ended) throw new Error("The local app has stopped.");
        const pending = join(directory, "preview.pending");
        await writeFile(pending, body, { mode: 0o600 });
        await rename(pending, snapshotPath);
        const response = await fetch(`${origin}/api/preview`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error(
            "Could not save the inspection locally. Check application-data permissions and retry.",
          );
      });
    return write;
  };
  try {
    const deadline = Date.now() + startupTimeout;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (ended) await closed;
      const response = await fetch(`${origin}/api/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(500),
      }).catch(() => null);
      if (response?.ok && response.headers.get("X-Senslop-Session") === token)
        return {
          origin,
          url: `${origin}/api/session?token=${token}`,
          snapshotPath,
          closed,
          setSnapshot,
          stop,
        };
      await Promise.race([
        sleep(100),
        closed.then(() => {
          throw new Error("Local app stopped during startup.");
        }),
      ]);
    }
    throw new Error(
      `Local app did not start within ${startupTimeout / 1000} seconds. ${stderr.trim()}`,
    );
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
};
