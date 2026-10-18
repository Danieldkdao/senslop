import open from "open";
import { log, spinner } from "@clack/prompts";
import { startLocalApp } from "./local-app.js";

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
  try {
    app = await startLocalApp({
      development,
      repository,
      signal: abort.signal,
    });
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
