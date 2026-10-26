import { access } from "node:fs/promises";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { resolveRepository } from "@senslop/review-core/git";
import { PushCheckpoint } from "@senslop/review-core/checkpoint";
import {
  installCheckpointHook,
  removeCheckpointHook,
} from "@senslop/review-core/checkpoint-hook";
import type { OutgoingRefSchema } from "@senslop/contracts";
import type { ParsedCliCommand } from "../commands/types.js";
import { applicationDataDirectory } from "../workspace/runtime-paths.js";
import {
  confirmDestructive,
  readTextInput,
  stringOption,
} from "../commands/input.js";
import { CliError } from "../commands/errors.js";

export const executeCheckpointCommand = async (
  command: ParsedCliCommand,
  repository: string,
) => {
  const root = await resolveRepository(repository);
  const database =
    stringOption(command.values, "database") ??
    join(applicationDataDirectory(), "reviews.sqlite");
  if (command.name === "checkpoint install") {
    await confirmDestructive(
      command.values,
      "Install the optional pre-push checkpoint while preserving existing hooks?",
    );
    return installCheckpointHook(
      root,
      [process.execPath, ...process.execArgv, process.argv[1]!],
      database,
    );
  }
  if (command.name === "checkpoint remove") {
    await confirmDestructive(
      command.values,
      "Remove only the Senslop pre-push integration?",
    );
    return removeCheckpointHook(root);
  }
  if (command.name !== "checkpoint configure")
    await access(database).catch(() => {
      throw new CliError(
        "No saved local review data is available for this checkpoint.",
        "checkpoint_unavailable",
        6,
      );
    });
  const store = new LocalStore(database);
  try {
    const checkpoint = new PushCheckpoint(store, root);
    const remote = stringOption(command.values, "remote") ?? "origin";
    if (command.name === "checkpoint configure") {
      const input = JSON.parse(
        await readTextInput(stringOption(command.values, "file") ?? "-"),
      );
      return checkpoint.savePolicy(input);
    }
    if (!checkpoint.policy().enabled && command.name === "checkpoint check")
      return { enabled: false, ready: true };
    let refs: OutgoingRefSchema[] | null = null;
    if (command.values.stdin) {
      refs = (await readTextInput("-"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [localRef, localOid, remoteRef, remoteOid] = line
            .trim()
            .split(/\s+/);
          if (!localRef || !localOid || !remoteRef || !remoteOid)
            throw new Error("Invalid pre-push input.");
          return { localRef, localOid, remoteRef, remoteOid };
        });
    }
    const result = refs
      ? await checkpoint.evaluate(remote, refs)
      : await checkpoint.outgoing(
          remote,
          stringOption(command.values, "branch") ?? "main",
        );
    if (command.name === "checkpoint override") {
      const reason = stringOption(command.values, "reason");
      if (!reason)
        throw new CliError(
          "Provide --reason for the exact outgoing override.",
          "invalid_arguments",
          2,
        );
      return checkpoint.override(result, reason);
    }
    if (
      result.enabled &&
      !result.ready &&
      !checkpoint.hasOverride(result, true)
    )
      throw new CliError(
        `Push checkpoint blocked:\n${result.issues.map((issue) => `- ${issue.message}${issue.path ? ` / ${issue.path}` : ""}`).join("\n")}\nReview the outgoing changes or run senslop checkpoint override --remote ${remote} --branch BRANCH --reason REASON.`,
        "checkpoint_blocked",
        6,
        result,
      );
    return result;
  } finally {
    store.close();
  }
};
