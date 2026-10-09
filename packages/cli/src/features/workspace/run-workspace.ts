import open from "open";
import { isCancel, log, select, spinner } from "@clack/prompts";
import { startLocalApp } from "./local-app.js";
import type { FrozenSnapshot } from "../git/snapshot.js";

type WorkspaceOptions = {
  interactive: boolean;
  snapshot?: FrozenSnapshot;
  inspect: (signal: AbortSignal) => Promise<FrozenSnapshot | null>;
};

export const runWorkspace = async ({
  interactive,
  snapshot,
  inspect,
}: WorkspaceOptions) => {
  if (snapshot && !snapshot.files.length)
    throw new Error(
      "No changed files to inspect. Choose another Git selection.",
    );
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const progress = spinner({ signal: abort.signal });
  progress.start("Starting your local Next.js workspace…");
  let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
  try {
    app = await startLocalApp({ signal: abort.signal });
    if (snapshot) await app.setSnapshot(snapshot);
    progress.stop("Local workspace is running.");
    log.info(
      `Open ${app.url}\nKeep this terminal open. Ctrl+C stops the app. No cloud login is required.`,
    );
    await open(app.url).catch(() =>
      log.warn("Could not open a browser automatically. Use the URL above."),
    );
    if (!interactive) {
      await app.closed;
      return;
    }
    void app.closed.then(stop, stop);
    while (!abort.signal.aborted) {
      const action = await select({
        message: "Your local app is running. What would you like to do?",
        signal: abort.signal,
        options: [
          { value: "inspect", label: "Inspect changes in this repository" },
          { value: "stop", label: "Stop the local app" },
        ],
      });
      if (isCancel(action) || action === "stop" || abort.signal.aborted) break;
      try {
        const nextSnapshot = await Promise.race([
          inspect(abort.signal),
          app.closed.then(() => null),
        ]);
        if (nextSnapshot && !abort.signal.aborted) {
          if (!nextSnapshot.files.length)
            throw new Error(
              "No changed files to inspect. Choose another Git selection.",
            );
          await app.setSnapshot(nextSnapshot);
          log.success(
            `${nextSnapshot.files.length} files are ready in your local workspace.`,
          );
        }
      } catch (error) {
        if (!abort.signal.aborted) log.error((error as Error).message);
      }
    }
    await app.stop();
  } catch (error) {
    progress.error("Local workspace stopped.");
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
