import open from "open";
import { setTimeout as sleep } from "node:timers/promises";
import { CliError } from "../commands/errors.js";
import { integerOption } from "../commands/input.js";
import type { ParsedCliCommand } from "../commands/types.js";
import { connectWorkspace } from "./workspace-client.js";

export const executeAppCommand = async (
  command: ParsedCliCommand,
  repository: string,
) => {
  const client = await connectWorkspace(repository).catch((error: Error) => {
    throw new CliError(error.message, "app_unavailable", 3);
  });
  if (command.name === "app open") {
    await open(client.browserUrl());
    return { opened: true, ...client.info() };
  }
  if (command.name === "app stop") {
    const { pid } = client.info();
    if (pid === process.pid)
      throw new CliError("The app must be stopped from another terminal.");
    process.kill(pid, "SIGTERM");
    const deadline =
      Date.now() + integerOption(command.values, "timeout", 10, 1, 3600) * 1000;
    while (Date.now() < deadline) {
      await sleep(100);
      if (!(await connectWorkspace(repository).catch(() => null)))
        return { stopped: true, ...client.info() };
    }
    throw new CliError(
      "The app has not stopped yet. Check its terminal.",
      "timeout",
      5,
    );
  }
  return { running: true, ...client.info() };
};
