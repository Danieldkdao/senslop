import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { MAX_FILE_BYTES } from "@senslop/contracts";
import { formatPatch, parsePatch, structuredPatch } from "diff";
import type { SnapshotFile } from "./snapshot";

const execute = promisify(execFile);

const gitPatch = async (file: SnapshotFile) => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-frozen-diff-"));
  try {
    await Promise.all([
      writeFile(join(directory, "before"), file.before ?? "", { mode: 0o600 }),
      writeFile(join(directory, "after"), file.after ?? "", { mode: 0o600 }),
    ]);
    let output: string;
    try {
      output = (
        await execute(
          "git",
          [
            "diff",
            "--no-index",
            "--histogram",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--text",
            "--unified=3",
            "--",
            "before",
            "after",
          ],
          {
            cwd: directory,
            timeout: 5000,
            maxBuffer: 8 * MAX_FILE_BYTES,
          },
        )
      ).stdout;
    } catch (error) {
      // git diff exits with 1 for a successful comparison containing changes.
      const failure = error as {
        code?: number;
        stdout?: string;
        killed?: boolean;
      };
      if (
        failure.code !== 1 ||
        failure.killed ||
        typeof failure.stdout !== "string"
      )
        throw new Error(
          `Diff generation exceeded its time limit or output limit (${file.path}). Retry with a smaller Git selection.`,
        );
      output = failure.stdout;
    }
    const patch = parsePatch(output)[0];
    if (!patch)
      throw new Error(
        `Diff generation failed (${file.path}). Retry this Git selection.`,
      );
    return patch;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const frozenDiff = async (file: SnapshotFile) => {
  const oldFileName =
    file.before === null ? "/dev/null" : `a/${file.oldPath ?? file.path}`;
  const newFileName = file.after === null ? "/dev/null" : `b/${file.path}`;
  const patch =
    structuredPatch(
      oldFileName,
      newFileName,
      file.before ?? "",
      file.after ?? "",
      undefined,
      undefined,
      { context: 3, timeout: 100 },
    ) ?? (await gitPatch(file));
  patch.oldFileName = oldFileName;
  patch.newFileName = newFileName;
  patch.isGit = true;
  patch.isCreate = file.before === null;
  patch.isDelete = file.after === null;
  patch.isRename = file.status.startsWith("R");
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) file.added++;
      if (line.startsWith("-")) file.deleted++;
    }
  }
  return formatPatch(patch);
};
