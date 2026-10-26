import { join } from "node:path";
import { select, isCancel, log } from "@clack/prompts";
import { LocalStore } from "@senslop/review-core/storage";
import {
  cachedRelease,
  detectInstallation,
  installRelease,
} from "@senslop/review-core/updates";
import cliPackage from "../../../package.json";
import { applicationDataDirectory } from "../workspace/runtime-paths.js";
import type { ParsedCliCommand } from "../commands/types.js";
import { confirmDestructive } from "../commands/input.js";

export const executeUpdateCommand = async (command: ParsedCliCommand) => {
  const database = join(applicationDataDirectory(), "reviews.sqlite");
  const store = new LocalStore(database);
  try {
    const release = await cachedRelease(store, cliPackage.version, true);
    if (command.name === "update check") return release;
    if (!release.available || !release.latest) return release;
    await confirmDestructive(
      command.values,
      `Update Senslop ${cliPackage.version} to ${release.latest}?`,
    );
    await installRelease(
      store,
      database,
      detectInstallation(process.argv[1] ?? ""),
      release.latest,
    );
    return { updated: true, version: release.latest };
  } finally {
    store.close();
  }
};

export const notifyCliUpdate = async (args: string[]) => {
  if (
    args.includes("--json") ||
    args[0] === "checkpoint" ||
    args[0] === "update" ||
    args.includes("--version") ||
    args[0] === "version"
  )
    return;
  const database = join(applicationDataDirectory(), "reviews.sqlite");
  const store = new LocalStore(database);
  try {
    const release = await cachedRelease(store, cliPackage.version);
    if (!release.available || !release.latest) return;
    process.stderr.write(
      `Senslop ${release.latest} is available; installed ${release.current}.\n`,
    );
    if (!process.stdin.isTTY || !process.stderr.isTTY) return;
    const answer = await select({
      message: `Update to Senslop ${release.latest}?`,
      initialValue: "later",
      options: [
        { value: "update", label: "Update now" },
        { value: "later", label: "Continue without updating" },
      ],
      output: process.stderr,
    });
    if (isCancel(answer) || answer !== "update") return;
    await installRelease(
      store,
      database,
      detectInstallation(process.argv[1] ?? ""),
      release.latest,
    );
    log.success(
      "Senslop updated; run the command again to use the new version.",
    );
    return true;
  } catch (error) {
    process.stderr.write(`Update unavailable: ${(error as Error).message}\n`);
  } finally {
    store.close();
  }
};
