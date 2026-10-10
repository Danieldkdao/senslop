import {
  eligibility,
  MAX_FILE_BYTES,
  MAX_SNAPSHOT_BYTES,
  type SourceSelectionSchema,
} from "@senslop/contracts";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { simpleGit } from "simple-git";
import { formatPatch, structuredPatch } from "diff";

const execute = promisify(execFile);

export const SNAPSHOT_LIMITS = {
  fileBytes: MAX_FILE_BYTES,
  totalBytes: MAX_SNAPSHOT_BYTES,
} as const;

export type GitSource = SourceSelectionSchema;
export type SnapshotFile = {
  path: string;
  oldPath: string | null;
  status: string;
  before: string | null;
  after: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  binary: boolean;
  added: number;
  deleted: number;
  diff: string;
};
export type FrozenSnapshot = {
  repositoryFingerprint?: string | null;
  source: {
    kind: GitSource["kind"];
    base: string;
    head: string | null;
    firstParent: boolean;
  };
  files: SnapshotFile[];
  excluded: {
    path: string;
    reason: string;
  }[];
  eligibility: {
    eligible: boolean;
    qualifyingFiles: number;
    requiredFiles: number;
    requiredChangedLines: number;
  };
  /** Selected text is frozen before any context-agent work starts. */
  frozenContents: Record<
    string,
    {
      before: string | null;
      after: string | null;
    }
  >;
  hash: string;
};

const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const git = async (cwd: string, args: string[]): Promise<Buffer> => {
  try {
    const result = await execute("git", args, {
      cwd,
      encoding: "buffer",
      maxBuffer: 25 * 1024 * 1024,
      // Git inherits PATH and user configuration; this is child-process plumbing.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return result.stdout;
  } catch (error) {
    const details = error as {
      stderr?: Buffer;
      message?: string;
    };
    throw new Error(
      `Git snapshot failed: ${details.stderr?.toString().trim() || details.message || "unknown error"}`,
    );
  }
};

const revision = async (cwd: string, input: string) => {
  if (!input || input.startsWith("-"))
    throw new Error("Select a commit revision, not a Git option.");
  return (
    await simpleGit({ baseDir: cwd, trimmed: false }).revparse([
      "--verify",
      "--end-of-options",
      `${input}^{commit}`,
    ])
  ).trim();
};
export const secretReason = (path: string): string | null => {
  const name = path.split("/").at(-1)!;
  if (
    (/^\.env(?:\.|$)/i.test(name) &&
      !/^\.env\.(example|sample|template)$/i.test(name)) ||
    /^(credentials(?:\..*)?|id_(rsa|dsa|ecdsa|ed25519)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials)$/i.test(
      name,
    ) ||
    /\.(pem|p12|pfx|key)$/i.test(name) ||
    /(^|\/)(\.aws|\.ssh|\.senslop)(\/|$)/.test(path)
  )
    return "credential-like path; excluded without reading contents";
  return null;
};
const parseChanges = (value: Buffer) => {
  const parts = value.toString("utf8").split("\0");
  const result: {
    status: string;
    oldPath: string | null;
    path: string;
  }[] = [];
  for (let index = 0; index < parts.length && parts[index];) {
    const status = parts[index++]!;
    const first = parts[index++]!;
    if (status.startsWith("R") || status.startsWith("C"))
      result.push({ status, oldPath: first, path: parts[index++]! });
    else
      result.push({
        status,
        oldPath: status === "A" ? null : first,
        path: first,
      });
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_SNAPSHOT_BYTES)
    throw new Error(
      "Serialized snapshot exceeds the 20 MiB upload limit, including diffs and metadata; nothing was truncated.",
    );
  return result;
};
const blob = async (
  cwd: string,
  ref: string,
  path: string,
): Promise<{
  bytes: Buffer | null;
  unsupported: string | null;
}> => {
  const entry = (await git(cwd, ["ls-tree", "-z", ref, "--", path])).toString();
  if (!entry) return { bytes: null, unsupported: null };
  const [mode, type, id] = entry.split("\t")[0]!.split(" ");
  if (mode === "120000")
    return { bytes: null, unsupported: "symlink; link targets are never read" };
  if (type !== "blob")
    return { bytes: null, unsupported: "submodule or unsupported Git entry" };
  const size = Number((await git(cwd, ["cat-file", "-s", id!])).toString());
  if (size > SNAPSHOT_LIMITS.fileBytes)
    throw new Error(
      `${path} exceeds the 1 MiB file limit; nothing was truncated.`,
    );
  return {
    bytes: await git(cwd, ["cat-file", "blob", id!]),
    unsupported: null,
  };
};
const localBytes = async (root: string, path: string) => {
  const absolute = resolve(root, path);
  if (
    isAbsolute(relative(root, absolute)) ||
    relative(root, absolute).startsWith(`..${sep}`)
  )
    throw new Error(`Unsafe repository path: ${path}`);
  // Check every directory component as well as the final file. O_NOFOLLOW closes final-link races.
  const components = path.split("/");
  for (let index = 1; index < components.length; index++) {
    try {
      if (
        (
          await lstat(join(root, ...components.slice(0, index)))
        ).isSymbolicLink()
      )
        return {
          bytes: null,
          unsupported: "symlink directory; link targets are never read",
        };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { bytes: null, unsupported: null };
      throw error;
    }
  }
  let handle;
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink())
      return {
        bytes: null,
        unsupported: "symlink; link targets are never read",
      };
    if (!stat.isFile())
      return { bytes: null, unsupported: "unsupported filesystem entry" };
    if (stat.size > SNAPSHOT_LIMITS.fileBytes)
      throw new Error(
        `${path} exceeds the 1 MiB file limit; nothing was truncated.`,
      );
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const bytes = await handle.readFile();
    if (bytes.length > SNAPSHOT_LIMITS.fileBytes)
      throw new Error(
        `${path} exceeds the 1 MiB file limit; nothing was truncated.`,
      );
    return { bytes, unsupported: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { bytes: null, unsupported: null };
    throw error;
  } finally {
    await handle?.close();
  }
};
const textContent = (bytes: Buffer | null): string | null => {
  if (bytes === null) return null;
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return null;
  }
};
const frozenDiff = (file: SnapshotFile) => {
  const patch = structuredPatch(
    file.before === null ? "/dev/null" : `a/${file.oldPath ?? file.path}`,
    file.after === null ? "/dev/null" : `b/${file.path}`,
    file.before ?? "",
    file.after ?? "",
    undefined,
    undefined,
    { context: 3, timeout: 5000 },
  );
  if (!patch)
    throw new Error(`Diff parsing exceeded its time limit (${file.path}).`);
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

export const collectSnapshot = async ({
  cwd,
  source,
}: {
  cwd: string;
  source: GitSource;
}): Promise<FrozenSnapshot> => {
  const root = (await simpleGit(cwd).revparse(["--show-toplevel"])).trim();
  let base: string;
  let head: string | null;
  let firstParent = false;
  if (source.kind === "commit") {
    head = await revision(root, source.commit);
    const parents = (
      await git(root, ["rev-list", "--parents", "-n", "1", head])
    )
      .toString()
      .trim()
      .split(" ")
      .slice(1);
    base =
      parents[0] ??
      createHash(
        (await git(root, ["rev-parse", "--show-object-format"]))
          .toString()
          .trim(),
      )
        .update("tree 0\0")
        .digest("hex");
    firstParent = parents.length > 1;
  } else if (source.kind === "range") {
    base = await revision(root, source.base);
    head = await revision(root, source.head);
    try {
      await git(root, ["merge-base", "--is-ancestor", base, head]);
    } catch {
      throw new Error(
        "Range BASE must be an ancestor of HEAD. Choose an ordered BASE..HEAD range.",
      );
    }
  } else if (source.kind === "branch") {
    base = await revision(root, source.base);
    head = await revision(root, source.branch);
  } else {
    base = await revision(root, "HEAD");
    head = null;
  }
  const changes = parseChanges(
    await git(root, [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--no-ext-diff",
      base,
      ...(head ? [head] : []),
      "--",
    ]),
  );
  const initialStatus = head
    ? null
    : await git(root, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]);
  if (!head) {
    const known = new Set(changes.map((file) => file.path));
    for (const path of (
      await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    )
      .toString()
      .split("\0")
      .filter(Boolean))
      if (!known.has(path)) changes.push({ path, oldPath: null, status: "A" });
  }
  const excluded: FrozenSnapshot["excluded"] = [];
  const files: SnapshotFile[] = [];
  let total = 0;
  // Read the selected source in full before producing diffs or letting callers invoke agents.
  for (const change of changes) {
    const secret =
      secretReason(change.path) ??
      (change.oldPath ? secretReason(change.oldPath) : null);
    if (secret) {
      excluded.push({ path: change.path, reason: secret });
      continue;
    }
    const before = change.oldPath
      ? await blob(root, base, change.oldPath)
      : { bytes: null, unsupported: null };
    const after = head
      ? await blob(root, head, change.path)
      : await localBytes(root, change.path);
    if (before.unsupported || after.unsupported) {
      excluded.push({
        path: change.path,
        reason: before.unsupported ?? after.unsupported!,
      });
      continue;
    }
    total += (before.bytes?.length ?? 0) + (after.bytes?.length ?? 0);
    if (total > SNAPSHOT_LIMITS.totalBytes)
      throw new Error(
        "Selected before/after contents exceed the 20 MiB snapshot limit; nothing was truncated.",
      );
    const beforeText = textContent(before.bytes);
    const afterText = textContent(after.bytes);
    const binary =
      (before.bytes !== null && beforeText === null) ||
      (after.bytes !== null && afterText === null);
    files.push({
      ...change,
      before: binary ? null : beforeText,
      after: binary ? null : afterText,
      beforeHash: before.bytes ? digest(before.bytes) : null,
      afterHash: after.bytes ? digest(after.bytes) : null,
      binary,
      added: 0,
      deleted: 0,
      diff: "",
    });
  }
  if (!head) {
    if (
      !initialStatus!.equals(
        await git(root, [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ]),
      )
    )
      throw new Error(
        "Working tree changed during collection. Retry to create one consistent frozen snapshot.",
      );
    for (const file of files) {
      const current = await localBytes(root, file.path);
      if (
        current.unsupported ||
        (current.bytes ? digest(current.bytes) : null) !== file.afterHash
      )
        throw new Error(
          `Working tree changed during collection (${file.path}). Retry the snapshot.`,
        );
    }
  }
  for (const file of files)
    file.diff = file.binary
      ? `Binary file ${JSON.stringify(file.path)} changed (metadata only).\n`
      : frozenDiff(file);
  const result = {
    source: { kind: source.kind, base, head, firstParent },
    files,
    excluded,
    eligibility: eligibility(
      files.map((file) => ({
        binary: file.binary,
        additions: file.added,
        deletions: file.deleted,
      })),
    ),
    frozenContents: Object.fromEntries(
      files
        .filter((file) => !file.binary)
        .map((file) => [file.path, { before: file.before, after: file.after }]),
    ),
    hash: "",
  };
  result.hash = digest(
    JSON.stringify({ source: result.source, files, excluded }),
  );
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_SNAPSHOT_BYTES)
    throw new Error(
      "Serialized snapshot exceeds the 20 MiB upload limit, including diffs and metadata; nothing was truncated.",
    );
  return result;
};
