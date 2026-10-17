import { parseArgs } from "node:util";
import {
  commandDefinitions,
  globalOptions,
  optionDefinitions,
} from "./definitions.js";
import type { ParsedCliCommand } from "./types.js";
import { CliError } from "./errors.js";

const parseCommandInput = (args: string[]): ParsedCliCommand => {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: optionDefinitions,
  });
  const values = parsed.values;
  if (values.version) return { name: "version", args: [], values, help: false };
  const words = parsed.positionals;
  const definition = [...commandDefinitions]
    .sort((a, b) => b.name.length - a.name.length)
    .find((item) =>
      item.name.split(" ").every((word, index) => words[index] === word),
    );
  const group = words[0] ?? "";
  if (!definition) {
    if (
      (!words.length ||
        commandDefinitions.some((item) => item.name.startsWith(`${group} `))) &&
      (values.help || !words.length)
    )
      return { name: group || "help", args: [], values, help: true };
    throw new Error(`Unknown command: ${words.join(" ")}. Run senslop --help.`);
  }
  const positionals = words.slice(definition.name.split(" ").length);
  for (const option of Object.keys(values))
    if (![...globalOptions, ...definition.options].includes(option))
      throw new Error(`--${option} is not valid for ${definition.name}.`);
  if (
    !values.help &&
    (positionals.length < (definition.minArgs ?? 0) ||
      positionals.length > (definition.maxArgs ?? 0))
  )
    throw new Error(
      `Usage: senslop ${definition.name} ${definition.arguments ?? ""}. Run with --help.`,
    );
  if (values.group && values["no-group"])
    throw new Error("Choose --group or --no-group, not both.");
  if (values.open && values["no-open"])
    throw new Error("Choose --open or --no-open, not both.");
  if (
    values.timeout !== undefined &&
    (!/^\d+$/.test(String(values.timeout)) ||
      Number(values.timeout) < 1 ||
      Number(values.timeout) > 3600)
  )
    throw new Error("--timeout must be 1–3600 seconds.");
  return {
    name: definition.name,
    args: positionals,
    values,
    help: !!values.help,
  };
};

export const parseCliCommand = (args: string[]) => {
  try {
    return parseCommandInput(args);
  } catch (error) {
    throw new CliError((error as Error).message, "invalid_arguments", 2);
  }
};
