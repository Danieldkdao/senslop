import open from "open";
import { log, spinner } from "@clack/prompts";
import { startLocalApp } from "./local-app.js";
import { connectWorkspace, type WorkspaceClient } from "./workspace-client.js";
import { WorkspaceOwnedError } from "./workspace-owner.js";
import { setTimeout as sleep } from "node:timers/promises";

type WorkspaceOptions = {
  development?: boolean;
  repository?: string;
  openBrowser?: boolean;
  json?: boolean;
};

export const runWorkspace = async ({
  development = false,
  repository = process.cwd(),
  openBrowser = true,
  json = false,
}: WorkspaceOptions = {}) => {
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const progress = json ? undefined : spinner({ signal: abort.signal });
  progress?.start("Starting your local workspace…");
  let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
  const reuse = async (client: WorkspaceClient) => {
    progress?.stop("Reusing the running local workspace.");
    if (json)
      console.log(
        JSON.stringify({ running: true, reused: true, ...client.info() }),
      );
    else
      log.info(
        `Local workspace is already running at ${client.info().origin}. Its owning terminal continues running background jobs.`,
      );
    if (openBrowser)
      await open(client.browserUrl()).catch(() => {
        if (!json)
          log.warn("Run senslop app open to open the existing workspace.");
      });
  };
  try {
    const existing = await connectWorkspace(repository).catch(() => null);
    if (existing) {
      await reuse(existing);
      return;
    }
    try {
      app = await startLocalApp({
        development,
        repository,
        signal: abort.signal,
      });
    } catch (error) {
      if (!(error instanceof WorkspaceOwnedError)) throw error;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        abort.signal.throwIfAborted();
        const client = await connectWorkspace(repository).catch(() => null);
        if (client) {
          await reuse(client);
          return;
        }
        await sleep(100, undefined, { signal: abort.signal });
      }
      throw new Error(
        "The workspace owner is running but has not published a healthy session. Check its terminal, then retry senslop app open.",
      );
    }
    progress?.stop("Local workspace is running.");
    if (json)
      console.log(
        JSON.stringify({
          running: true,
          repository,
          origin: app.origin,
          pid: process.pid,
        }),
      );
    else
      log.info(
        `Open ${app.url}\nThis terminal runs the app and background jobs. Ctrl+C stops them.\nRun senslop commands from another terminal in this repository.`,
      );
    if (openBrowser)
      await open(app.url).catch(() => {
        if (!json)
          log.warn(
            "Could not open the browser. Run senslop app open from another terminal.",
          );
      });
    await app.closed;
  } catch (error) {
    progress?.error("Local workspace stopped.");
    if (!(abort.signal.aborted && (error as Error).name === "AbortError"))
      throw error;
  } finally {
    try {
      await app?.stop();
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  }
};
