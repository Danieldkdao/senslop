import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, isAbsolute, relative } from "node:path";
import {
  checkRunSchema,
  type CheckRunSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { localBytes } from "../git/snapshot";
import { WorkflowStore } from "./workflow-store";
import {
  materializeReview,
  readExecutionManifest,
  executionSourceChanged,
  hashExecutionBytes,
} from "./execution-manifest";
import {
  allowsSourcePath,
  readProjectPolicy,
  sourcePolicyHash,
} from "./project-policy";
import { runCheckProcess } from "./check-process";

export class CheckRunner {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
    readonly parent: string,
  ) {}

  list = (reviewId: string) => {
    if (!this.store.getReview(this.repository, reviewId)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM check_runs WHERE review_id=? ORDER BY rowid DESC",
      )
      .all(reviewId)
      .map((row) => checkRunSchema.parse(JSON.parse(String(row.body))));
  };

  get = (id: string) => {
    const row = this.store.database
      .prepare(
        "SELECT c.body FROM check_runs c JOIN reviews r ON r.id=c.review_id WHERE c.id=? AND r.repository=?",
      )
      .get(id, this.repository);
    return row ? checkRunSchema.parse(JSON.parse(String(row.body))) : null;
  };

  save = (run: CheckRunSchema) => {
    if (!this.store.getReview(this.repository, run.review.id))
      return { ...run, status: "canceled" as const };
    const savedRun = checkRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    this.store.database
      .prepare(
        "INSERT INTO check_runs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(run.id, run.review.id, JSON.stringify(savedRun));
    return savedRun;
  };

  create = (
    review: ReviewIdentitySchema,
    input: {
      command: string;
      artifactPaths?: string[];
      cwd?: string;
      findingIds?: string[];
      timeoutSeconds?: number;
      reuseCheckId?: string;
      baselineId?: string;
      compareWithBase?: boolean;
      sourceSide?: "changed" | "base";
    },
  ): CheckRunSchema => {
    new WorkflowStore(this.store, this.repository).requireReview(
      review.id,
      review,
    );
    if (!input.command.trim() || input.command.length > 5000)
      throw new Error("Choose a command under 5,000 characters.");
    if (
      input.cwd &&
      (isAbsolute(input.cwd) || input.cwd.split(/[\\/]/).includes(".."))
    )
      throw new Error(
        "Choose a working directory inside the execution workspace.",
      );
    const findings = new WorkflowStore(this.store, this.repository).findings(
      review.id,
    );
    if (
      input.findingIds?.some((id) => !findings.some((item) => item.id === id))
    )
      throw new Error("Check finding does not belong to this review.");
    if (
      input.artifactPaths?.some(
        (path) =>
          !allowsSourcePath(
            readProjectPolicy(this.store, this.repository),
            path,
          ),
      )
    )
      throw new Error("Artifact path is excluded or unsafe.");
    const previous = input.reuseCheckId ? this.get(input.reuseCheckId) : null;
    if (
      input.reuseCheckId &&
      (!previous ||
        previous.review.id !== review.id ||
        previous.sourceSide !== (input.sourceSide ?? "changed") ||
        previous.review.hash !== review.hash ||
        previous.review.round !== review.round ||
        previous.ownerPid !== null ||
        ["queued", "running"].includes(previous.status))
    )
      throw new Error("Choose a completed check from this exact review round.");
    const baseline = input.compareWithBase
      ? this.create(review, {
          ...input,
          compareWithBase: false,
          reuseCheckId: undefined,
          sourceSide: "base",
        })
      : null;
    const now = new Date().toISOString();
    return this.save(
      checkRunSchema.parse({
        id: randomUUID(),
        sourceSide: input.sourceSide ?? "changed",
        review,
        command: input.command,
        artifactPaths: input.artifactPaths ?? [],
        cwd: input.cwd ?? ".",
        findingIds: input.findingIds ?? [],
        status: "queued",
        manifestId: previous?.manifestId ?? null,
        environment: {},
        dependencyHash: null,
        output: "",
        exitCode: null,
        durationMs: null,
        sourceModified: false,
        error: null,
        baselineId: baseline?.id ?? input.baselineId ?? null,
        timeoutSeconds:
          input.timeoutSeconds ??
          readProjectPolicy(this.store, this.repository).checkTimeoutSeconds,
        createdAt: now,
        updatedAt: now,
      }),
    );
  };

  cancel = (id: string) =>
    this.store.transaction(() => {
      const run = this.get(id);
      if (!run) throw new Error("Check not found.");
      if (!["queued", "running"].includes(run.status)) return run;
      return this.save({ ...run, status: "canceled" });
    });

  run = async (id: string) => {
    const initial = this.get(id);
    if (!initial || initial.status !== "queued") return initial;
    const claimed = this.store.transaction(() => {
      const current = this.get(id);
      if (current?.status !== "queued") return null;
      return this.save({
        ...current,
        status: "running",
        ownerPid: process.pid,
      });
    });
    if (!claimed) return this.get(id);
    let run = claimed;
    const started = performance.now();
    const abort = new AbortController();
    const timer = setInterval(() => {
      if (this.get(id)?.status !== "running") abort.abort();
    }, 100);
    timer.unref();
    try {
      const workflow = new WorkflowStore(this.store, this.repository);
      const review = workflow.requireReview(run.review.id, run.review);
      const manifest = run.manifestId
        ? readExecutionManifest(this.store, this.repository, run.manifestId)
        : await materializeReview(
            this.store,
            this.repository,
            review,
            this.parent,
            run.sourceSide,
          );
      if (
        manifest.policyHash !==
          sourcePolicyHash(readProjectPolicy(this.store, this.repository)) ||
        (await executionSourceChanged(manifest))
      )
        throw new Error(
          "Execution source or policy changed. Create a fresh workspace.",
        );
      const cwd = await realpath(join(manifest.directory, run.cwd));
      if (relative(manifest.directory, cwd).startsWith(".."))
        throw new Error("Command directory escapes its execution workspace.");
      let installedState = "";
      for (const path of [
        "node_modules/.modules.yaml",
        "node_modules/.package-lock.json",
        "node_modules/.pnpm/lock.yaml",
      ])
        try {
          installedState += await readFile(
            join(manifest.directory, path),
            "utf8",
          );
        } catch {}
      if (this.get(id)?.status !== "running") abort.abort();
      abort.signal.throwIfAborted();
      run = this.store.transaction(() => {
        if (this.get(id)?.status !== "running") {
          abort.abort();
          abort.signal.throwIfAborted();
        }
        return this.save({
          ...run,
          manifestId: manifest.id,
          dependencyHash: hashExecutionBytes(
            `${manifest.dependencyHash}:${installedState}`,
          ),
          environment: {
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
            dependencyState: installedState
              ? "Recorded installed metadata"
              : "No installed dependency metadata",
            execution: "Managed local worktree; host permissions",
            directory: cwd,
          },
        });
      });
      const result = await runCheckProcess({
        command: run.command,
        cwd,
        timeoutSeconds: run.timeoutSeconds,
        signal: abort.signal,
        onOutput: (text) =>
          this.store.transaction(() => {
            if (this.get(id)?.status !== "running") {
              abort.abort();
              return;
            }
            if (run.output.length < 1024 * 1024) {
              run.output = (run.output + text).slice(0, 1024 * 1024);
              this.save({ ...run, status: "running" });
            }
          }),
      });
      const sourceModified = await executionSourceChanged(
        manifest,
        run.artifactPaths,
      );
      const artifacts = await Promise.all(
        run.artifactPaths.map(async (path) => {
          try {
            const file = await localBytes(
              manifest.directory,
              path,
              1024 * 1024,
            );
            if (!file.bytes || file.unsupported)
              throw new Error(file.unsupported ?? "Artifact not produced.");
            return {
              path,
              hash: hashExecutionBytes(file.bytes),
              size: file.bytes.length,
              error: null,
            };
          } catch (error) {
            return {
              path,
              hash: null,
              size: null,
              error: (error as Error).message,
            };
          }
        }),
      );
      return this.store.transaction(() => {
        const current = this.get(id);
        const status =
          current?.status === "interrupted"
            ? "interrupted"
            : result.canceled || current?.status === "canceled"
              ? "canceled"
              : result.timedOut
                ? "timed-out"
                : result.exitCode === 127
                  ? "blocked"
                  : result.exitCode === 0 && !sourceModified
                    ? "passed"
                    : "failed";
        return this.save({
          ...run,
          status,
          ownerPid: null,
          exitCode: result.exitCode,
          artifacts,
          sourceModified,
          durationMs: Math.round(performance.now() - started),
          error: sourceModified
            ? "Command modified captured source. This is not a pass against the original inputs."
            : status === "interrupted"
              ? (current?.error ?? "Execution interrupted.")
              : null,
        });
      });
    } catch (error) {
      return this.store.transaction(() => {
        const current = this.get(id);
        return this.save({
          ...run,
          status:
            current?.status === "interrupted"
              ? "interrupted"
              : abort.signal.aborted
                ? "canceled"
                : "blocked",
          ownerPid: null,
          error:
            current?.status === "interrupted"
              ? current.error
              : (error as Error).message,
          durationMs: Math.round(performance.now() - started),
        });
      });
    } finally {
      clearInterval(timer);
    }
  };
}
