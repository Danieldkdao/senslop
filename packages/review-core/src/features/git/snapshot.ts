import {
  eligibility,
  MAX_FILE_BYTES,
  MAX_SNAPSHOT_BYTES,
  type SourceSelectionSchema,
  type PreviewImageSchema,
  type PreviewImageAssetSchema,
} from "@senslop/contracts";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { simpleGit } from "simple-git";
import { frozenDiff } from "./frozen-diff";
import { freezeImagePreview } from "./image-preview";

const execute = promisify(execFile);

export const SNAPSHOT_LIMITS = {
  fileBytes: MAX_FILE_BYTES,
  totalBytes: MAX_SNAPSHOT_BYTES,
} as const;

export class SnapshotLimitError extends Error {}

const checkFileSize = (size: number, path: string, limit: number) => {
  if (size > limit)
    throw new SnapshotLimitError(
      `${path} exceeds the ${limit / (1024 * 1024)} MiB file limit; nothing was truncated.`,
    );
};

export type GitSource = SourceSelectionSchema;
export type SnapshotFile = {
  imagePreview?: PreviewImageSchema;
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

const git = async (
  cwd: string,
  args: string[],
  input?: string,
): Promise<Buffer> => {
  try {
    const execution = execute("git", args, {
      cwd,
      encoding: "buffer",
      maxBuffer: 25 * 1024 * 1024,
      // Git inherits PATH and user configuration; this is child-process plumbing.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (input !== undefined) execution.child.stdin?.end(input);
    return (await execution).stdout;
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
  const parts = path.split("/");
  const name = parts.at(-1)!;
  const credentialModule = /^credentials\.(?:[cm]?[jt]sx?|py|go)$/i.test(name);
  const reviewConfig =
    name === "review.json" &&
    parts.at(-2) === ".senslop" &&
    parts.filter((part) => part === ".senslop").length === 1;
  if (
    (/^\.env(?:\.|$)/i.test(name) &&
      !/^\.env\.(example|sample|template)$/i.test(name)) ||
    (/^credentials(?:\..*)?$/i.test(name) && !credentialModule) ||
    /^(id_(rsa|dsa|ecdsa|ed25519)(?:\.pub)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials)$/i.test(
      name,
    ) ||
    /\.(pem|p12|pfx|key)$/i.test(name) ||
    /(^|\/)(\.aws|\.ssh)(\/|$)/.test(path) ||
    (/(^|\/)\.senslop(\/|$)/.test(path) && !reviewConfig)
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
    throw new SnapshotLimitError(
      "Serialized snapshot exceeds the 20 MiB upload limit, including diffs and metadata; nothing was truncated.",
    );
  return result;
};
export const blob = async (
  cwd: string,
  ref: string,
  path: string,
  byteLimit: number = SNAPSHOT_LIMITS.fileBytes,
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
  checkFileSize(size, path, byteLimit);
  return {
    bytes: await git(cwd, ["cat-file", "blob", id!]),
    unsupported: null,
  };
};
export const readBlobBatch = async (
  cwd: string,
  ref: string,
  paths: string[],
  byteLimit: number,
  includeBinary = false,
) => {
  const tree = await git(cwd, ["ls-tree", "-r", "-l", "-z", ref]);
  const entries = new Map(
    tree
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("\t");
        return [
          entry.slice(separator + 1),
          entry.slice(0, separator).trim().split(/\s+/),
        ] as const;
      }),
  );
  const selected: { path: string; id: string; size: number; mode: number }[] =
    [];
  const unavailable: string[] = [];
  let bytes = 0;
  let limited = false;
  for (const path of paths) {
    const entry = entries.get(path);
    if (!entry) continue;
    const [mode, type, id, length] = entry;
    // Symlinks are excluded source, never execution inputs or link targets.
    if (mode === "120000") continue;
    if (type !== "blob") {
      if (includeBinary) unavailable.push(path);
      continue;
    }
    const size = Number(length);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > (includeBinary ? byteLimit : SNAPSHOT_LIMITS.fileBytes)
    ) {
      unavailable.push(path);
      continue;
    }
    if (bytes + size > byteLimit) {
      limited = true;
      break;
    }
    bytes += size;
    selected.push({ path, id: id!, size, mode: parseInt(mode!, 8) });
  }
  const sources: Record<string, string> = {};
  const binarySources: Record<string, Buffer> = {};
  const modes: Record<string, number> = {};
  if (!selected.length)
    return { sources, binarySources, modes, unavailable, limited };
  // Object IDs keep batch input safe even when repository filenames contain newlines.
  const output = await git(
    cwd,
    ["cat-file", "--batch"],
    selected.map(({ id }) => id).join("\n") + "\n",
  );
  let offset = 0;
  for (const { path, id, size, mode } of selected) {
    const end = output.indexOf(10, offset);
    if (
      end < 0 ||
      output.toString("utf8", offset, end) !== `${id} blob ${size}` ||
      end + size + 1 >= output.length
    )
      throw new Error("Git context batch returned an invalid object.");
    const contents = output.subarray(end + 1, end + 1 + size);
    if (includeBinary) {
      binarySources[path] = contents;
      modes[path] = mode;
    } else if (!contents.includes(0)) sources[path] = contents.toString("utf8");
    offset = end + size + 2;
  }
  return { sources, binarySources, modes, unavailable, limited };
};

export const localBytes = async (
  root: string,
  path: string,
  byteLimit: number = SNAPSHOT_LIMITS.fileBytes,
  digestOnly = false,
) => {
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
    if (!digestOnly) checkFileSize(stat.size, path, byteLimit);
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (digestOnly) {
      const hash = createHash("sha256");
      for await (const chunk of handle.createReadStream({ autoClose: false }))
        hash.update(chunk);
      return { bytes: null, unsupported: null, hash: hash.digest("hex") };
    }
    const bytes = await handle.readFile();
    checkFileSize(bytes.length, path, byteLimit);
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

export const collectSnapshot = async ({
  cwd,
  source,
  allowPath,
}: {
  cwd: string;
  source: GitSource;
  allowPath?: (path: string) => boolean;
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
    if (
      allowPath &&
      (!allowPath(change.path) ||
        (change.oldPath && !allowPath(change.oldPath)))
    ) {
      excluded.push({
        path: change.path,
        reason: "Excluded by project source policy.",
      });
      continue;
    }
    const secret =
      secretReason(change.path) ??
      (change.oldPath ? secretReason(change.oldPath) : null);
    if (secret) {
      excluded.push({ path: change.path, reason: secret });
      continue;
    }
    // Binary contents are hashed locally; only text is subject to the 1 MiB limit.
    const before = change.oldPath
      ? await blob(root, base, change.oldPath, SNAPSHOT_LIMITS.totalBytes)
      : { bytes: null, unsupported: null };
    const after = head
      ? await blob(root, head, change.path, SNAPSHOT_LIMITS.totalBytes)
      : await localBytes(root, change.path, SNAPSHOT_LIMITS.totalBytes);
    if (before.unsupported || after.unsupported) {
      excluded.push({
        path: change.path,
        reason: before.unsupported ?? after.unsupported!,
      });
      continue;
    }
    const beforeText = textContent(before.bytes);
    const afterText = textContent(after.bytes);
    if (beforeText !== null)
      checkFileSize(
        before.bytes!.length,
        change.oldPath ?? change.path,
        SNAPSHOT_LIMITS.fileBytes,
      );
    if (afterText !== null)
      checkFileSize(
        after.bytes!.length,
        change.path,
        SNAPSHOT_LIMITS.fileBytes,
      );
    const binary =
      (before.bytes !== null && beforeText === null) ||
      (after.bytes !== null && afterText === null);
    const imagePreview = binary
      ? freezeImagePreview(change.path, before.bytes, after.bytes)
      : undefined;
    if (imagePreview)
      total +=
        (imagePreview.before?.base64.length ?? 0) +
        (imagePreview.after?.base64.length ?? 0);
    // Binary contents are hashed locally; only retained text counts toward the payload budget.
    if (!binary)
      total += (before.bytes?.length ?? 0) + (after.bytes?.length ?? 0);
    if (total > SNAPSHOT_LIMITS.totalBytes)
      throw new SnapshotLimitError(
        "Selected before/after contents exceed the 20 MiB snapshot limit; nothing was truncated.",
      );
    files.push({
      ...(imagePreview ? { imagePreview } : {}),
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
      const current = await localBytes(
        root,
        file.path,
        SNAPSHOT_LIMITS.totalBytes,
      );
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
      : await frozenDiff(file);
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
    throw new SnapshotLimitError(
      "Serialized snapshot exceeds the 20 MiB upload limit, including diffs and metadata; nothing was truncated.",
    );
  return result;
};

export const resyncSnapshot = async (
  root: string,
  baseline: SnapshotFile[],
  current: FrozenSnapshot,
  retained?: SnapshotFile[],
) => {
  const states = (files: SnapshotFile[]) => {
    const contents = new Map<
      string,
      {
        text: string | null;
        hash: string | null;
        binary: boolean;
        image?: PreviewImageAssetSchema | null;
      }
    >();
    for (const file of files) {
      if (
        file.status.startsWith("R") &&
        file.oldPath &&
        file.oldPath !== file.path
      )
        contents.set(file.oldPath, { text: null, hash: null, binary: false });
      contents.set(file.path, {
        text: file.after,
        hash: file.afterHash,
        binary: file.binary,
        image: file.imagePreview?.after,
      });
    }
    return contents;
  };
  const before = states(baseline);
  const after = states(current.files);
  // Restore this round's original sides while leaving older rounds in the baseline.
  for (const file of retained ?? []) {
    const path = file.oldPath ?? file.path;
    before.set(path, {
      text: file.before,
      hash: file.beforeHash,
      binary: file.binary,
      image: file.imagePreview?.before,
    });
    if (path !== file.path)
      before.set(file.path, { text: null, hash: null, binary: false });
  }
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  if (paths.length > 2000)
    throw new SnapshotLimitError(
      "Re-sync exceeds the 2,000-file snapshot limit; nothing was truncated.",
    );
  const excluded = new Set(current.excluded.map((file) => file.path));
  const files: SnapshotFile[] = [];
  for (const path of paths) {
    if (excluded.has(path)) continue;
    let original = {
      text: null as string | null,
      hash: null as string | null,
      binary: false,
      image: null as PreviewImageAssetSchema | null,
    };
    if (!before.has(path) || !after.has(path)) {
      const result = await blob(
        root,
        current.source.base,
        path,
        SNAPSHOT_LIMITS.totalBytes,
      );
      if (result.unsupported)
        throw new Error(
          `Re-sync cannot capture ${path}: ${result.unsupported}.`,
        );
      const text = textContent(result.bytes);
      if (text !== null)
        checkFileSize(result.bytes!.length, path, SNAPSHOT_LIMITS.fileBytes);
      original = {
        text,
        hash: result.bytes ? digest(result.bytes) : null,
        binary: result.bytes !== null && text === null,
        image:
          freezeImagePreview(path, result.bytes, result.bytes)?.before ?? null,
      };
    }
    const previous = before.get(path) ?? original;
    const latest = after.get(path) ?? original;
    if (previous.hash === latest.hash) continue;
    const binary = previous.binary || latest.binary;
    const file: SnapshotFile = {
      path,
      oldPath: previous.hash === null ? null : path,
      status: previous.hash === null ? "A" : latest.hash === null ? "D" : "M",
      before: binary ? null : previous.text,
      after: binary ? null : latest.text,
      beforeHash: previous.hash,
      afterHash: latest.hash,
      binary,
      ...(/\.(?:png|jpe?g|webp)$/i.test(path) && binary
        ? {
            imagePreview: {
              before: previous.image ?? null,
              after: latest.image ?? null,
            },
          }
        : {}),
      added: 0,
      deleted: 0,
      diff: "",
    };
    file.diff = binary
      ? `Binary file ${JSON.stringify(path)} changed (metadata only).\n`
      : await frozenDiff(file);
    files.push(file);
  }
  if (!files.length && !retained)
    throw new Error(
      "No new changes since this review round. Make more edits before re-syncing.",
    );
  const snapshot = { ...current, files };
  snapshot.hash = digest(
    JSON.stringify({
      source: snapshot.source,
      files,
      excluded: snapshot.excluded,
    }),
  );
  if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES)
    throw new SnapshotLimitError(
      "Re-sync exceeds the 20 MiB snapshot limit; nothing was truncated.",
    );
  return snapshot;
};
