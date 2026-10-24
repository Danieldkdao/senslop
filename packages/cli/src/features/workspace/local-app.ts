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
import { startLocalJobs, availablePort, workspacePort } from "./local-jobs.js";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import {
  MAX_SNAPSHOT_BYTES,
  PROTOCOL_VERSION,
  previewUploadSchema,
  localPreviewSchema,
} from "@senslop/contracts";

import { resolveRepository } from "@senslop/review-core/git";
import { applicationDataDirectory } from "./runtime-paths.js";
import {
  publishWorkspaceSession,
  removeWorkspaceSession,
} from "./workspace-session.js";
export { applicationDataDirectory } from "./runtime-paths.js";

type LocalAppOptions = {
  repository?: string;
  dataDirectory?: string;
  development?: boolean;
  appDirectory?: string;
  serverPath?: string;
  signal?: AbortSignal;
  startupTimeout?: number;
  jobs?: boolean;
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
  startupTimeout = 60000,
  jobs = true,
}: LocalAppOptions = {}) => {
  const directoryPath = resolve(repository);
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
    port = jobs
      ? await workspacePort(userData, repositoryRoot)
      : await availablePort();
    if (jobs) await availablePort(port);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const origin = `http://127.0.0.1:${port}`;
  const session = {
    version: 1 as const,
    repository: repositoryRoot,
    origin,
    token,
    pid: process.pid,
  };
  // A runtime launcher must construct process env; never pass cloud secrets or ambient Node hooks.
  const env = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USER",
      "LOGNAME",
      "SHELL",
      "TERM",
      "LANG",
      "LC_ALL",
      "TMPDIR",
      "APPDATA",
      "LOCALAPPDATA",
      "COMSPEC",
      "SYSTEMROOT",
      "SystemRoot",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "PATHEXT",
      "WINDIR",
      "TEMP",
      "TMP",
      "TZ",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_RUNTIME_DIR",
      "DISPLAY",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
      "NODE_EXTRA_CA_CERTS",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
      "CLAUDE_CONFIG_DIR",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
  );
  const parentModule = fileURLToPath(
    new URL("./parent-monitor.mjs", import.meta.url),
  );
  const args = development
    ? ["dev", "--hostname", "127.0.0.1", "--port", String(port)]
    : [];
  let engine: Awaited<ReturnType<typeof startLocalJobs>> | undefined;
  try {
    if (jobs)
      engine = await startLocalJobs({
        dataDirectory: userData,
        repository: repositoryRoot,
        sdkUrl: `${origin}/api/inngest?token=${token}`,
        signal,
      });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const child = fork(entry, args, {
    cwd,
    env: {
      ...env,
      ...engine?.env,
      INNGEST_DEV: "0",
      NODE_ENV: development ? "development" : "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      SENSLOP_LOCAL_STARTED_AT: new Date().toISOString(),
      SENSLOP_LOCAL_ORIGIN: origin,
      SENSLOP_LOCAL_TOKEN: token,
      SENSLOP_LOCAL_SNAPSHOT: snapshotPath,
      SENSLOP_LOCAL_REPOSITORY: repositoryRoot,
      SENSLOP_LOCAL_DIRECTORY: directoryPath,
      SENSLOP_LOCAL_DATABASE: join(userData, "reviews.sqlite"),
    },
    execArgv: ["--import", pathToFileURL(parentModule).href],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout?.on("data", (chunk) => process.stderr.write(chunk));
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
    process.stderr.write(chunk);
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
    await engine?.stop().catch(() => {});
    await write.catch(() => {});
    await removeWorkspaceSession(userData, session);
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
      await engine?.stop().catch(() => {});
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
  void engine?.closed.catch(() => child.kill("SIGTERM"));
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
          signal: AbortSignal.timeout(120000),
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
      if (response?.ok && response.headers.get("X-Senslop-Session") === token) {
        if (engine) {
          const registration = await fetch(
            `${origin}/api/inngest?token=${engine.env.SENSLOP_LOCAL_WORKER_TOKEN}`,
            {
              method: "PUT",
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!registration.ok)
            throw new Error(
              "Could not register the local AI worker. Restart Senslop to retry.",
            );
        }
        await publishWorkspaceSession(userData, session);
        return {
          origin,
          url: `${origin}/api/session?token=${token}`,
          snapshotPath,
          closed,
          setSnapshot,
          stop,
        };
      }
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
