import type { ParsedCliCommand } from "../commands/types.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import { CliError } from "../commands/errors.js";
import { readTextInput, stringOption } from "../commands/input.js";

const settingsPath = (section: string) => {
  switch (section) {
    case "ai":
      return "/api/agents/settings";
    case "review":
      return "/api/review-preferences";
    case "ui":
      return "/api/ui-preferences";
    default:
      throw new CliError(
        "--section must be ai, review, or ui.",
        "invalid_arguments",
        2,
      );
  }
};

export const executeSettingsCommand = async (
  client: WorkspaceClient,
  { name, args, values }: ParsedCliCommand,
) => {
  const path = settingsPath(stringOption(values, "section") ?? "ai");
  if (name === "settings show") return client.request(path);
  const file = stringOption(values, "file");
  const valueFile = stringOption(values, "value-file");
  let patch: unknown;
  if (file) {
    if (args.length || valueFile)
      throw new CliError(
        "Use --file alone for a settings patch.",
        "invalid_arguments",
        2,
      );
    patch = JSON.parse(await readTextInput(file));
  } else {
    const key = args[0];
    if (
      !key ||
      (!valueFile && args.length !== 2) ||
      (valueFile && args.length !== 1)
    )
      throw new CliError(
        "Provide KEY VALUE, KEY --value-file PATH, or --file JSON_PATH.",
        "invalid_arguments",
        2,
      );
    const parts = key.split(".");
    if (
      parts.some(
        (part) =>
          !part || ["__proto__", "prototype", "constructor"].includes(part),
      )
    )
      throw new CliError("Invalid setting key.", "invalid_arguments", 2);
    let value: unknown = valueFile ? await readTextInput(valueFile) : args[1];
    if (!valueFile) {
      try {
        value = JSON.parse(String(value));
      } catch {
        /* Plain text values are valid string settings. */
      }
    }
    patch = parts.reduceRight<unknown>(
      (current, part) => ({ [part]: current }),
      value,
    );
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new CliError(
      "The settings patch must be a JSON object.",
      "invalid_arguments",
      2,
    );
  return client.request(path, patch, "PATCH");
};
