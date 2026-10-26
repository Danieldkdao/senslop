import { createHash } from "node:crypto";
import {
  access,
  readFile,
  writeFile,
  rename,
  unlink,
  chmod,
} from "node:fs/promises";
import { dirname } from "node:path";
import { constants } from "node:fs";
import { gitProcess } from "./git-process";

const marker = "# senslop managed pre-push v1";
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const location = async (repository: string) =>
  (
    await gitProcess(repository, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "hooks/pre-push",
    ])
  ).trim();

export const checkpointHookStatus = async (repository: string) => {
  const path = await location(repository);
  const body = await readFile(path, "utf8").catch(() => "");
  return { installed: body.includes(marker), existing: !!body, path };
};

export const installCheckpointHook = async (
  repository: string,
  runner: string[],
  database: string,
) => {
  if (!runner.length)
    throw new Error(
      "CLI entry point unavailable; install the hook through the CLI.",
    );
  const status = await checkpointHookStatus(repository);
  if (status.installed) return status;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(status.path), { recursive: true });
  const backup = `${status.path}.senslop-original`;
  if (status.existing) {
    if (
      await access(backup)
        .then(() => true)
        .catch(() => false)
    )
      throw new Error(
        "An existing hook backup needs manual inspection before installation.",
      );
    await rename(status.path, backup);
  }
  const original = shellQuote(backup);
  const command = [
    ...runner,
    "checkpoint",
    "check",
    "--stdin",
    "--repo",
    repository,
    "--database",
    database,
  ]
    .map(shellQuote)
    .join(" ");
  const script = `#!/bin/sh\n${marker}\ninput=$(mktemp) || exit 1\ntrap 'rm -f "$input"' EXIT HUP INT TERM\ncat > "$input"\nif test -x ${original}; then ${original} "$@" < "$input" || exit $?; fi\n${command} --remote "$1" < "$input"\n`;
  let installed = false;
  try {
    await writeFile(status.path, script, { mode: 0o700, flag: "wx" });
    installed = true;
    await chmod(status.path, 0o700);
    await writeFile(
      `${status.path}.senslop-sha256`,
      createHash("sha256").update(script).digest("hex"),
      { mode: 0o600 },
    );
  } catch (error) {
    if (installed) await unlink(status.path).catch(() => {});
    if (
      status.existing &&
      !(await access(status.path)
        .then(() => true)
        .catch(() => false))
    )
      await rename(backup, status.path);
    throw error;
  }
  return checkpointHookStatus(repository);
};

export const removeCheckpointHook = async (repository: string) => {
  const status = await checkpointHookStatus(repository);
  if (!status.installed) return status;
  const body = await readFile(status.path, "utf8");
  const expected = await readFile(
    `${status.path}.senslop-sha256`,
    "utf8",
  ).catch(() => null);
  if (
    expected !== createHash("sha256").update(body).digest("hex") ||
    !body.startsWith(`#!/bin/sh\n${marker}\n`) ||
    !body.endsWith(' < "$input"\n')
  )
    throw new Error(
      "The hook was edited; remove Senslop integration manually to preserve those changes.",
    );
  await unlink(status.path);
  await unlink(`${status.path}.senslop-sha256`);
  const backup = `${status.path}.senslop-original`;
  if (
    await access(backup, constants.F_OK)
      .then(() => true)
      .catch(() => false)
  )
    await rename(backup, status.path);
  return checkpointHookStatus(repository);
};
