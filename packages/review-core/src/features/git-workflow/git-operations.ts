import { findReviewedChange } from "./review-coverage";
import { savedReviewSchema } from "@senslop/contracts";
import { PushCheckpoint } from "./push-checkpoint";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  rm,
  readFile,
  lstat,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gitActionSchema,
  gitOperationSchema,
  gitStateSchema,
  type GitActionSchema,
  type GitStateSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { localBytes } from "../git/snapshot";
import { frozenDiff } from "../git/frozen-diff";
import type { PreviewFileSchema } from "@senslop/contracts";
import { readRepository } from "../git/repository";
import {
  allowsSourcePath,
  readProjectPolicy,
} from "../workflow/project-policy";
import { recordNotification } from "../notifications/notification-events";
import {
  gitProcess,
  gitBlobDigest,
  gitIdentity,
  validateGitPath,
  withRepositoryLease,
} from "./git-process";

const quoteShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const cleanRemote = (value: string) =>
  value.replace(/(https?:\/\/)[^/@\s]+@/g, "$1").replace(/[?#].*$/, "");

export class GitOperations {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}

  status = async (): Promise<GitStateSchema> => {
    const git = (args: string[]) => gitProcess(this.repository, args);
    const [
      raw,
      branch,
      head,
      upstream,
      remotes,
      fingerprint,
      cached,
      mergeInProgress,
    ] = await Promise.all([
      git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      git(["symbolic-ref", "--quiet", "--short", "HEAD"])
        .then((value) => value.trim())
        .catch(() => "Detached HEAD"),
      git(["rev-parse", "--verify", "HEAD"])
        .then((value) => value.trim())
        .catch(() => null),
      git(["rev-parse", "--abbrev-ref", "@{upstream}"])
        .then((value) => value.trim())
        .catch(() => null),
      git(["remote"]).then(async (value) =>
        Promise.all(
          value
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(async (name) => ({
              name,
              url: cleanRemote(
                (await git(["remote", "get-url", "--push", "--", name])).trim(),
              ),
            })),
        ),
      ),
      readRepository(this.repository)
        .then((value) => value.fingerprint)
        .catch(() => null),
      git(["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"]),
      git([
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "MERGE_HEAD",
      ]).then((path) =>
        access(path.trim())
          .then(() => true)
          .catch(() => false),
      ),
    ]);
    const policy = readProjectPolicy(this.store, this.repository);
    const stats = async (staged: boolean) => {
      const output = await git([
        "diff",
        ...(staged ? ["--cached"] : []),
        "--numstat",
        "-z",
        "--no-renames",
        "--no-ext-diff",
        "--no-textconv",
      ]);
      return new Map(
        output
          .split("\0")
          .filter(Boolean)
          .map((entry) => {
            const first = entry.indexOf("\t");
            const second = entry.indexOf("\t", first + 1);
            return [
              entry.slice(second + 1),
              [
                Number(entry.slice(0, first)) || 0,
                Number(entry.slice(first + 1, second)) || 0,
              ],
            ];
          }),
      );
    };
    const [stagedStats, workingStats] = await Promise.all([
      stats(true),
      stats(false),
    ]);
    const entries = raw.split("\0");
    const files: GitStateSchema["files"] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (!entry) continue;
      const path = entry.slice(3);
      const oldPath = /[RC]/.test(entry.slice(0, 2))
        ? (entries[++i] ?? null)
        : null;
      files.push({
        path,
        oldPath,
        index: entry[0]!,
        working: entry[1]!,
        excluded: !allowsSourcePath(policy, path),
        stagedAdded: stagedStats.get(path)?.[0] ?? 0,
        stagedDeleted: stagedStats.get(path)?.[1] ?? 0,
        added: workingStats.get(path)?.[0] ?? 0,
        deleted: workingStats.get(path)?.[1] ?? 0,
      });
    }
    await Promise.all(
      files
        .filter((file) => file.index === "?" && !file.excluded)
        .map(async (file) => {
          const { bytes } = await localBytes(this.repository, file.path).catch(
            () => ({ bytes: null }),
          );
          if (bytes && !bytes.includes(0))
            file.added = bytes.length
              ? bytes.toString("utf8").split("\n").length -
                Number(bytes.at(-1) === 10)
              : 0;
        }),
    );
    const fileIdentity = await Promise.all(
      files.map(async (file) => {
        try {
          const info = await lstat(join(this.repository, file.path), {
            bigint: true,
          });
          return [
            file.path,
            ...[info.mode, info.size, info.mtimeNs, info.ctimeNs, info.ino].map(
              String,
            ),
          ];
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          return [file.path, null];
        }
      }),
    );
    const counts = upstream
      ? (
          await git([
            "rev-list",
            "--left-right",
            "--count",
            `HEAD...${upstream}`,
          ]).catch(() => "0 0")
        )
          .trim()
          .split(/\s+/)
          .map(Number)
      : [0, 0];
    for (const row of this.store.database
      .prepare(
        "SELECT id,body FROM git_operations WHERE repository=? AND json_extract(body,'$.status')='running'",
      )
      .all(this.repository)) {
      const previous = gitOperationSchema.parse(JSON.parse(String(row.body)));
      if (!previous.ownerPid) continue;
      try {
        process.kill(previous.ownerPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
        this.store.database
          .prepare("UPDATE git_operations SET body=? WHERE id=?")
          .run(
            JSON.stringify({
              ...previous,
              status: "interrupted",
              finishedAt: new Date().toISOString(),
              output:
                "The owning process exited; refresh repository state before retrying.",
            }),
            row.id,
          );
      }
    }
    const operations = this.store.database
      .prepare(
        "SELECT body FROM git_operations WHERE repository=? ORDER BY rowid DESC LIMIT 30",
      )
      .all(this.repository)
      .map((row) => gitOperationSchema.parse(JSON.parse(String(row.body))));
    return gitStateSchema.parse({
      identity: gitIdentity({
        raw,
        head,
        branch,
        fingerprint,
        fileIdentity,
        cached,
        remotes,
        upstream,
        mergeInProgress,
        counts,
      }),
      head,
      branch,
      upstream,
      ahead: counts[0],
      behind: counts[1],
      remotes,
      files,
      conflicts: files
        .filter(
          (file) =>
            file.index === "U" ||
            file.working === "U" ||
            ["AA", "DD"].includes(file.index + file.working),
        )
        .map((file) => file.path),
      operations,
      mergeInProgress,
      fetchedAt:
        operations.find(
          (operation) =>
            operation.action === "fetch" && operation.status === "completed",
        )?.finishedAt ?? null,
    });
  };

  diff = async (path: string, staged: boolean) => {
    validateGitPath(path);
    if (!allowsSourcePath(readProjectPolicy(this.store, this.repository), path))
      throw new Error("This file is excluded from source review.");
    const state = await this.status();
    if (!state.files.some((file) => file.path === path))
      throw new Error("File is no longer changed.");
    if (
      !staged &&
      (
        await lstat(join(this.repository, path)).catch(() => null)
      )?.isSymbolicLink()
    )
      throw new Error("Symlink content is not opened for source review.");
    if (
      !staged &&
      state.files.some((file) => file.path === path && file.index === "?")
    )
      return gitProcess(this.repository, [
        "diff",
        "--no-index",
        "--",
        process.platform === "win32" ? "NUL" : "/dev/null",
        path,
      ]).catch(async () => {
        if ((await lstat(join(this.repository, path))).size > 1024 * 1024)
          return "Oversized untracked file; stage as a whole file.";
        const text = await readFile(join(this.repository, path), "utf8");
        if (Buffer.byteLength(text) > 1024 * 1024 || text.includes("\0"))
          return "Binary or oversized untracked file; stage as a whole file.";
        return text;
      });
    return gitProcess(this.repository, [
      "diff",
      ...(staged ? ["--cached"] : []),
      "--no-ext-diff",
      "--no-textconv",
      "--",
      path,
    ]);
  };

  preview = async (
    path: string,
    staged: boolean,
  ): Promise<PreviewFileSchema> => {
    validateGitPath(path);
    const state = await this.status();
    const entry = state.files.find((file) => file.path === path);
    if (!entry || entry.excluded)
      throw new Error("File unavailable for source preview.");
    const blob = async (ref: string, sourcePath: string) => {
      const spec = ref === ":" ? `:${sourcePath}` : `${ref}:${sourcePath}`;
      const mode =
        ref === ":"
          ? await gitProcess(this.repository, [
              "ls-files",
              "--stage",
              "--",
              sourcePath,
            ])
          : await gitProcess(this.repository, [
              "ls-tree",
              ref,
              "--",
              sourcePath,
            ]);
      if (!mode.trim()) return null;
      if (!/^100(644|755) /.test(mode))
        throw new Error(
          "Symlinks and unsupported Git entries are excluded from source previews.",
        );
      return Buffer.from(await gitProcess(this.repository, ["show", spec]));
    };
    const beforeBytes = staged
      ? state.head
        ? await blob("HEAD", entry.oldPath ?? path)
        : null
      : await blob(":", path);
    const afterBytes = staged
      ? await blob(":", path)
      : (await localBytes(this.repository, path)).bytes;
    const binary = [beforeBytes, afterBytes].some(
      (bytes) => bytes && (bytes.includes(0) || bytes.length > 1024 * 1024),
    );
    const file: PreviewFileSchema = {
      path,
      oldPath: entry.oldPath,
      status:
        entry.index === "?"
          ? "A"
          : (staged ? entry.index : entry.working).trim() || "M",
      before: binary ? null : (beforeBytes?.toString("utf8") ?? null),
      after: binary ? null : (afterBytes?.toString("utf8") ?? null),
      beforeHash: beforeBytes
        ? await gitBlobDigest(
            this.repository,
            staged ? "HEAD" : "",
            staged ? (entry.oldPath ?? path) : path,
          )
        : null,
      afterHash: afterBytes
        ? staged
          ? await gitBlobDigest(this.repository, "", path)
          : createHash("sha256").update(afterBytes).digest("hex")
        : null,
      binary,
      diff: "",
      added: 0,
      deleted: 0,
    };
    if (!binary) {
      file.diff = await frozenDiff(file);
    }
    if ((await this.status()).identity !== state.identity)
      throw new Error("Repository changed during preview. Refresh and retry.");
    return file;
  };

  conflict = async (path: string) => {
    validateGitPath(path);
    if (!allowsSourcePath(readProjectPolicy(this.store, this.repository), path))
      throw new Error("This file is excluded from source review.");
    if (!(await this.status()).conflicts.includes(path))
      throw new Error("This file has no unresolved index conflict.");
    const side = async (stage: number) => {
      const object = `:${stage}:${path}`;
      const size = await gitProcess(this.repository, [
        "cat-file",
        "-s",
        object,
      ]).catch(() => null);
      if (size === null) return null;
      if (Number(size) > 1024 * 1024)
        return "Oversized conflict side; inspect it in your editor.";
      const text = await gitProcess(this.repository, [
        "show",
        "--no-textconv",
        object,
      ]);
      return text.includes("\0")
        ? "Binary conflict side; inspect it in your editor."
        : text;
    };
    const [base, local, incoming] = await Promise.all([
      side(1),
      side(2),
      side(3),
    ]);
    return { base, local, incoming };
  };

  private coverage = async (
    base: string | null,
    revision: string,
    paths: string[],
  ) => {
    const reviews = this.store.database
      .prepare("SELECT body FROM reviews WHERE repository=?")
      .all(this.repository)
      .map((row) => savedReviewSchema.parse(JSON.parse(String(row.body))));
    const coverage: {
      reviewId: string;
      hash: string;
      round: number;
      paths: string[];
    }[] = [];
    for (const path of paths) {
      const afterHash = await gitBlobDigest(this.repository, revision, path);
      const beforeHash = base
        ? await gitBlobDigest(this.repository, base, path)
        : null;
      const after = await gitProcess(this.repository, [
        "show",
        `${revision}:${path}`,
      ]).catch(() => null);
      const before = base
        ? await gitProcess(this.repository, ["show", `${base}:${path}`]).catch(
            () => null,
          )
        : null;
      const review = findReviewedChange(
        this.store,
        reviews,
        path,
        beforeHash,
        afterHash,
        after,
        before,
      );
      if (review) {
        const existing = coverage.find((entry) => entry.reviewId === review.id);
        if (existing) existing.paths.push(path);
        else
          coverage.push({
            reviewId: review.id,
            hash: review.hash,
            round: review.round,
            paths: [path],
          });
      }
    }
    return coverage;
  };

  candidate = async () => {
    const state = await this.status();
    if (state.conflicts.length)
      throw new Error("Resolve conflicts before inspecting commit coverage.");
    const tree = (await gitProcess(this.repository, ["write-tree"])).trim();
    const paths = (
      await gitProcess(this.repository, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
      ])
    )
      .split("\0")
      .filter(Boolean);
    return {
      tree,
      total: paths.length,
      coverage: await this.coverage(state.head, tree, paths),
    };
  };

  private commit = async (
    operation: Extract<GitActionSchema, { action: "commit" }>,
    state: GitStateSchema,
  ) => {
    if (state.conflicts.length)
      throw new Error("Resolve index conflicts before committing.");
    const tree = (await gitProcess(this.repository, ["write-tree"])).trim();
    if (
      !(
        await gitProcess(this.repository, ["diff", "--cached", "--name-only"])
      ).trim()
    )
      throw new Error("Stage changes before committing.");
    const hooks = (
      await gitProcess(this.repository, [
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "hooks",
      ])
    ).trim();
    const directory = await mkdtemp(join(tmpdir(), "senslop-commit-"));
    try {
      for (const name of [
        "pre-commit",
        "prepare-commit-msg",
        "commit-msg",
        "post-commit",
      ]) {
        const original = quoteShell(join(hooks, name));
        const guard =
          name === "post-commit"
            ? ""
            : `\ngit diff --cached --quiet ${quoteShell(tree)} -- || { echo 'Commit candidate changed in a hook. Inspect the staged diff and retry.' >&2; exit 1; }\n`;
        await writeFile(
          join(directory, name),
          `#!/bin/sh\nif test -x ${original}; then ${original} "$@" || exit $?; fi\n${guard}`,
          { mode: 0o700 },
        );
      }
      const output = await gitProcess(this.repository, [
        "-c",
        `core.hooksPath=${directory}`,
        "commit",
        "-m",
        operation.subject,
        ...(operation.body ? ["-m", operation.body] : []),
      ]);
      const commit = (
        await gitProcess(this.repository, ["rev-parse", "HEAD"])
      ).trim();
      const actualTree = (
        await gitProcess(this.repository, ["rev-parse", "HEAD^{tree}"])
      ).trim();
      if (actualTree !== tree)
        throw new Error(
          `Commit ${commit} was created with hook-modified content; review it before pushing.`,
        );
      const paths = (
        await gitProcess(this.repository, [
          "diff-tree",
          "--root",
          "--no-commit-id",
          "-r",
          "--name-only",
          "-z",
          ...(state.head ? [state.head, commit] : [commit]),
        ])
      )
        .split("\0")
        .filter(Boolean);
      const coverage = await this.coverage(state.head, commit, paths);
      return { output, commit, coverage };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  act = (
    input: GitActionSchema,
    beforePush?: (
      operation: Extract<GitActionSchema, { action: "push" }>,
    ) => Promise<void>,
  ) =>
    withRepositoryLease(this.store, this.repository, async () => {
      const operation = gitActionSchema.parse(input);
      const state = await this.status();
      if (state.identity !== operation.expected)
        throw new Error(
          "Repository changed. Refresh the Git preview and retry.",
        );
      const activeTask = this.store.database
        .prepare(
          "SELECT 1 FROM fix_tasks WHERE json_extract(body,'$.workspaceKind')='current' AND json_extract(body,'$.status')='in-progress' AND json_extract(body,'$.directory')=? LIMIT 1",
        )
        .get(this.repository);
      if (activeTask)
        throw new Error(
          "Finish the active current-worktree fix before changing Git state.",
        );
      const id = randomUUID();
      const record = {
        id,
        action: operation.action,
        status: "running" as "running" | "completed" | "failed",
        output: "",
        commit: null as string | null,
        ownerPid: process.pid,
        createdAt: new Date().toISOString(),
        finishedAt: null as string | null,
      };
      const save = () =>
        this.store.database
          .prepare(
            "INSERT INTO git_operations VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
          )
          .run(id, this.repository, JSON.stringify(record));
      save();
      try {
        switch (operation.action) {
          case "stage-all":
            record.output = await gitProcess(this.repository, [
              "add",
              "--all",
              "--",
              ".",
            ]);
            break;
          case "unstage-all":
            record.output = await gitProcess(
              this.repository,
              state.head
                ? ["restore", "--staged", "--", ":/"]
                : ["rm", "--cached", "-r", "-f", "--", "."],
            );
            break;
          case "stage":
          case "unstage": {
            validateGitPath(operation.path);
            const selected = state.files.find(
              (file) => file.path === operation.path,
            );
            if (!selected) throw new Error("File is no longer changed.");
            const selectedPaths = [
              operation.path,
              ...(selected.oldPath ? [validateGitPath(selected.oldPath)] : []),
            ];
            if (operation.hunk !== undefined) {
              const patch = (
                await this.preview(
                  operation.path,
                  operation.action === "unstage",
                )
              ).diff;
              const marker = patch.indexOf("@@ ");
              if (marker < 0)
                throw new Error("This change requires whole-file staging.");
              const header = patch.slice(0, marker);
              const hunks = patch.slice(marker).split(/(?=^@@ )/m);
              const hunk = hunks[operation.hunk];
              if (!hunk)
                throw new Error("Hunk changed. Refresh before staging.");
              record.output = await gitProcess(
                this.repository,
                [
                  "apply",
                  "--cached",
                  ...(operation.action === "unstage" ? ["--reverse"] : []),
                  "--whitespace=nowarn",
                  "-",
                ],
                { input: header + hunk },
              );
            } else if (operation.action === "stage")
              record.output = await gitProcess(this.repository, [
                "add",
                "--",
                operation.path,
              ]);
            else if (state.head)
              record.output = await gitProcess(this.repository, [
                "restore",
                "--staged",
                "--",
                ...selectedPaths,
              ]);
            else
              record.output = await gitProcess(this.repository, [
                "rm",
                "--cached",
                "--",
                operation.path,
              ]);
            break;
          }
          case "abort-merge": {
            if (!state.mergeInProgress)
              throw new Error(
                "No merge is in progress; resolve other Git operations in your terminal.",
              );
            record.output = await gitProcess(this.repository, [
              "merge",
              "--abort",
            ]);
            break;
          }
          case "commit":
            Object.assign(record, await this.commit(operation, state));
            break;
          case "fetch":
          case "pull":
          case "push": {
            if (
              !state.remotes.some(
                (remote) => remote.name === operation.remote,
              ) ||
              operation.remote.startsWith("-")
            )
              throw new Error("Choose a configured remote.");
            if (
              operation.action !== "fetch" &&
              (!operation.branch ||
                operation.branch.startsWith("-") ||
                /[\s:~^?*\[\\]/.test(operation.branch))
            )
              throw new Error("Choose a valid destination branch.");
            if (operation.action === "pull") {
              if (state.files.length || state.conflicts.length)
                throw new Error(
                  "Commit or move local changes before pulling; automatic stashing is disabled.",
                );
              record.output = await gitProcess(this.repository, [
                "pull",
                "--ff-only",
                "--no-autostash",
                operation.remote,
                operation.branch,
              ]);
            } else if (operation.action === "push") {
              if (!state.head || state.branch === "Detached HEAD")
                throw new Error("Select a local branch before pushing.");
              const checkpoint = new PushCheckpoint(
                this.store,
                this.repository,
              );
              if (checkpoint.policy().enabled || operation.expectedOutgoing) {
                const coverage = await checkpoint.outgoing(
                  operation.remote,
                  operation.branch,
                );
                if (
                  operation.expectedOutgoing &&
                  coverage.identity !== operation.expectedOutgoing
                )
                  throw new Error(
                    "Outgoing destination or objects changed. Refresh before pushing.",
                  );
                if (coverage.enabled && !coverage.ready) {
                  if (operation.overrideReason)
                    checkpoint.override(coverage, operation.overrideReason);
                  else if (!checkpoint.hasOverride(coverage))
                    throw new Error(
                      "Push checkpoint requires attention. Inspect outgoing coverage or record an override reason.",
                    );
                }
              }
              await beforePush?.(operation);
              record.output = await gitProcess(this.repository, [
                "push",
                operation.remote,
                `${state.head}:refs/heads/${operation.branch}`,
              ]);
              await gitProcess(this.repository, [
                "config",
                `branch.${state.branch}.remote`,
                operation.remote,
              ]);
              await gitProcess(this.repository, [
                "config",
                `branch.${state.branch}.merge`,
                `refs/heads/${operation.branch}`,
              ]);
            } else
              record.output = await gitProcess(this.repository, [
                "fetch",
                "--",
                operation.remote,
              ]);
            recordNotification(this.store, this.repository, {
              id: `git:${id}`,
              kind: "git",
              reviewId: null,
              title: `${operation.action} completed`,
            });
            break;
          }
        }
        record.status = "completed";
        return { ...record, finishedAt: new Date().toISOString() };
      } catch (error) {
        record.status = "failed";
        record.output = cleanRemote((error as Error).message);
        recordNotification(this.store, this.repository, {
          id: `git:${id}`,
          kind: "attention",
          reviewId: null,
          title: "Git operation needs attention",
        });
        throw new Error(record.output);
      } finally {
        record.finishedAt = new Date().toISOString();
        save();
      }
    });
}
