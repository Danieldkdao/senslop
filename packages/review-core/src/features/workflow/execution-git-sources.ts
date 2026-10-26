import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExecutionManifestSchema } from "@senslop/contracts";
import { gitProcess } from "../git-workflow/git-process";

export const writeExecutionGitSources = async (
  root: string,
  base: string,
  paths: string[],
  directory?: string,
): Promise<ExecutionManifestSchema["files"]> => {
  const allowed = new Set(paths);
  const tree = await gitProcess(root, ["ls-tree", "-r", "-l", "-z", base]);
  const entries = tree
    .split("\0")
    .filter(Boolean)
    .flatMap((entry) => {
      const separator = entry.indexOf("\t");
      const path = entry.slice(separator + 1);
      if (!allowed.has(path)) return [];
      const [mode, type, id, length] = entry
        .slice(0, separator)
        .trim()
        .split(/\s+/);
      if (mode === "120000") return [];
      const size = Number(length);
      if (type !== "blob" || !Number.isSafeInteger(size) || size < 0)
        throw new Error(`Execution input is an unsupported Git entry: ${path}`);
      return [{ path, id: id!, size, mode: parseInt(mode!, 8) & 0o777 }];
    });
  if (!entries.length) return [];
  // Stream exact blobs without checkout filters; omit the destination for digest-only comparison.
  const child = spawn("git", ["cat-file", "--batch"], { cwd: root });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-12000);
  });
  const finished = new Promise<Error | null>((resolve) => {
    child.once("error", resolve);
    child.once("close", (code) =>
      resolve(
        code === 0
          ? null
          : new Error(stderr || "Git execution source copy failed."),
      ),
    );
  });
  // A stopped Git process reports its failure through close, including broken input pipes.
  child.stdin.on("error", () => {});
  child.stdin.end(entries.map((entry) => entry.id).join("\n") + "\n");
  const chunks = child.stdout[Symbol.asyncIterator]();
  let buffered: Buffer = Buffer.alloc(0);
  const fill = async () => {
    const next = await chunks.next();
    if (next.done)
      throw new Error(
        "Git execution source ended before all files were copied.",
      );
    buffered = next.value as Buffer;
  };
  const readHeader = async () => {
    let header = "";
    while (true) {
      if (!buffered.length) await fill();
      const newline = buffered.indexOf(10);
      if (newline >= 0) {
        header += buffered.toString("utf8", 0, newline);
        buffered = buffered.subarray(newline + 1);
        return header;
      }
      header += buffered.toString("utf8");
      if (header.length > 256)
        throw new Error("Git execution source returned an invalid header.");
      buffered = Buffer.alloc(0);
    }
  };
  const files: ExecutionManifestSchema["files"] = [];
  try {
    for (const entry of entries) {
      if ((await readHeader()) !== `${entry.id} blob ${entry.size}`)
        throw new Error(
          `Git execution source does not match the captured tree: ${entry.path}`,
        );
      const destination = directory ? join(directory, entry.path) : null;
      if (destination)
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const file = destination
        ? await open(destination, "wx", entry.mode)
        : null;
      const hash = createHash("sha256");
      try {
        let remaining = entry.size;
        while (remaining > 0) {
          if (!buffered.length) await fill();
          const bytes = buffered.subarray(
            0,
            Math.min(remaining, buffered.length),
          );
          await file?.writeFile(bytes);
          hash.update(bytes);
          remaining -= bytes.length;
          buffered = buffered.subarray(bytes.length);
        }
        await file?.chmod(entry.mode);
      } finally {
        await file?.close();
      }
      if (!buffered.length) await fill();
      if (buffered[0] !== 10)
        throw new Error(
          "Git execution source returned an invalid file boundary.",
        );
      buffered = buffered.subarray(1);
      files.push({
        path: entry.path,
        hash: hash.digest("hex"),
        mode: entry.mode,
      });
    }
    const failure = await finished;
    if (failure) throw failure;
    return files;
  } finally {
    child.kill();
    await finished;
  }
};
