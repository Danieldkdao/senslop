import { readFile } from "node:fs/promises";
import { confirm, isCancel } from "@clack/prompts";
import { CliError } from "./errors.js";
import type { CliValues } from "./types.js";

export const stringOption = (values: CliValues, key: string) =>
  typeof values[key] === "string" ? (values[key] as string) : undefined;

export const integerOption = (
  values: CliValues,
  key: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) => {
  const raw = stringOption(values, key);
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^\d+$/.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new CliError(
      `--${key} must be an integer from ${min} to ${max}.`,
      "invalid_arguments",
      2,
    );
  return value;
};

export const readTextInput = async (path: string) => {
  if (path !== "-") return readFile(path, "utf8");
  if (process.stdin.isTTY)
    throw new CliError(
      "Pipe input when using - as the input path.",
      "invalid_arguments",
      2,
    );
  let value = "";
  for await (const chunk of process.stdin) {
    value += String(chunk);
    if (Buffer.byteLength(value) > 2 * 1024 * 1024)
      throw new CliError("Input exceeds 2 MiB.", "invalid_arguments", 2);
  }
  return value;
};

export const confirmDestructive = async (
  values: CliValues,
  message: string,
) => {
  if (values.yes) return;
  if (values.json || !process.stdin.isTTY || !process.stdout.isTTY)
    throw new CliError(
      "This operation requires --yes to confirm.",
      "confirmation_required",
      2,
    );
  const answer = await confirm({ message });
  if (isCancel(answer) || !answer)
    throw new CliError("Canceled. No changes made.", "canceled");
};

export const noteBody = async (values: CliValues) => {
  const file = stringOption(values, "body-file");
  const body = stringOption(values, "body");
  if (!!file === (body !== undefined))
    throw new CliError(
      "Use exactly one of --body or --body-file.",
      "invalid_arguments",
      2,
    );
  return file ? readTextInput(file) : body!;
};
