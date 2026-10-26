import { withRepositoryLease } from "@senslop/review-core/git-process";
import { applyFixChanges } from "@senslop/review-core/fix-changes";
import { assignedModel } from "../../agents/lib/model-selection";
import { AgentStore } from "../../agents/lib/agent-store";
import { freezeContext } from "../../../services/analysis/frozen-context";
import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { readFile, rename, stat, unlink, realpath } from "node:fs/promises";
import {
  type ResyncMode,
  MAX_SNAPSHOT_BYTES,
  PROTOCOL_VERSION,
  localPreviewSchema,
  type SavedReviewSchema,
  sourceSelectionSchema,
} from "@senslop/contracts";
import {
  inspectRepository,
  collectSnapshot,
  resyncSnapshot,
  readRepository,
  resolveRepository,
  readCommonGitDirectory,
} from "@senslop/review-core/git";
import { LocalStore } from "@senslop/review-core/storage";
import {
  readProjectPolicy,
  allowsSourcePath,
} from "@senslop/review-core/policy";

type LocalWorkspaceOptions = {
  repository: string;
  directory?: string;
  databasePath: string;
  snapshotPath: string;
};

export class LocalWorkspace {
  readonly store: LocalStore;
  private handoff: Promise<void> = Promise.resolve();
  private contexts = new Set<Promise<void>>();
  private operations: Promise<unknown> = Promise.resolve();
  private projectIdentity: Promise<void> | null = null;
  constructor(private readonly options: LocalWorkspaceOptions) {
    this.store = new LocalStore(options.databasePath);
    this.store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(
        `known_project:${options.repository}`,
        JSON.stringify({
          root: options.repository,
          directory: options.directory ?? options.repository,
        }),
      );
  }

  root = async () => {
    const root = await resolveRepository(this.options.repository);
    if (root !== this.options.repository)
      throw new Error(
        "The opened repository root changed. Restart the CLI in the intended repository.",
      );
    this.projectIdentity ??= readCommonGitDirectory(root).then((common) => {
      this.store.database
        .prepare(
          "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        )
        .run(`project_common:${root}`, common);
      for (const name of [
        "project_ai_settings",
        "project_review_preferences",
        "project_policy",
      ]) {
        const previous = this.store.database
          .prepare("SELECT value FROM preferences WHERE name=?")
          .get(`${name}:${root}`);
        if (previous)
          this.store.database
            .prepare("INSERT OR IGNORE INTO preferences VALUES (?,?)")
            .run(`${name}:${common}`, String(previous.value));
      }
    });
    await this.projectIdentity;
    return root;
  };

  repository = async () => readRepository(await this.root());

  directory = () => this.options.directory ?? this.options.repository;

  coordinate = <T>(operation: () => Promise<T>) => {
    const result = this.operations
      .catch(() => {})
      .then(async () =>
        withRepositoryLease(this.store, await this.root(), operation),
      );
    this.operations = result;
    return result;
  };

  private callerDirectory = async (root: string, directory?: string) => {
    if (!directory) return this.directory();
    if (!isAbsolute(directory))
      throw new Error(
        "Choose an absolute caller folder inside this workspace repository.",
      );
    const folder = await realpath(directory);
    if (
      (await resolveRepository(folder)) !== root ||
      !(await stat(folder)).isDirectory()
    )
      throw new Error(
        "The caller folder does not belong to this workspace repository.",
      );
    return resolve(directory);
  };

  private groupingEnabled = (root: string, selected?: boolean) => {
    const settings = new AgentStore(this.store, root).settings();
    if (selected === false) return false;
    if (selected === true && !assignedModel(settings, "grouping"))
      throw new Error(
        "Choose a grouping model in Settings → AI, or create the review with --no-group.",
      );
    if (selected === true) return true;
    if (!assignedModel(settings, "grouping")) return false;
    switch (settings.groupingMode) {
      case "always":
        return true;
      case "never":
        return false;
      case "ask":
        return true;
    }
  };

  private captureContext = (root: string, review: SavedReviewSchema) => {
    const capture = freezeContext(this.store, root, review);
    this.contexts.add(capture);
    void capture.finally(() => this.contexts.delete(capture)).catch(() => {});
  };

  inspect = (
    input: unknown,
    group?: boolean,
    options: { directory?: string; activate?: boolean } = {},
  ) =>
    this.coordinate(async () => {
      const selection = sourceSelectionSchema.options
        .find(
          (schema) =>
            schema.shape.kind.value === (input as { kind?: string })?.kind,
        )
        ?.strict()
        .parse(input);
      if (!selection) throw new Error("Choose a supported Git selection.");
      const root = await this.root();
      const directory = await this.callerDirectory(root, options.directory);
      const groupingEnabled = this.groupingEnabled(root, group);
      const policy = readProjectPolicy(this.store, root);
      const inspection = await inspectRepository(root, selection, (path) =>
        allowsSourcePath(policy, path),
      );
      const savedReview = this.store.saveReview(
        root,
        {
          ...inspection.snapshot,
          id: randomUUID(),
          protocolVersion: PROTOCOL_VERSION,
        },
        inspection.fingerprint,
        groupingEnabled,
        {
          directory,
          repositoryState: inspection.repository,
          activate: options.activate ?? false,
        },
      );
      this.captureContext(root, savedReview);
      return savedReview;
    });

  resync = (
    id: string,
    mode: ResyncMode = "new",
    group?: boolean,
    expected?: {
      hash: string;
      round: number;
      activate?: boolean;
      directory?: string;
    },
  ) => this.coordinate(() => this.resyncNow(id, mode, group, expected));

  applyTask = (
    taskId: string,
    review: import("@senslop/contracts").ReviewIdentitySchema,
    paths: string[],
  ) =>
    this.coordinate(async () => {
      const task = await applyFixChanges(
        this.store,
        await this.root(),
        taskId,
        review,
        paths,
      );
      try {
        return {
          task,
          review: await this.resyncNow(review.id, "keep", undefined, review),
        };
      } catch (error) {
        return {
          task,
          review: null,
          warning: `Edits applied; re-sync is still required: ${(error as Error).message}`,
        };
      }
    });

  private resyncNow = async (
    id: string,
    mode: ResyncMode = "new",
    group?: boolean,
    expected?: {
      hash: string;
      round: number;
      activate?: boolean;
      directory?: string;
    },
  ) => {
    const root = await this.root();
    const previousReview = this.store.getReview(root, id);
    if (
      !previousReview ||
      (expected &&
        (previousReview.hash !== expected.hash ||
          previousReview.round !== expected.round))
    )
      throw new Error(
        "Review contents changed or were deleted. Reload and retry re-sync.",
      );
    if (
      previousReview.source.kind !== "working-tree" ||
      !previousReview.repositoryState
    )
      throw new Error(
        "Re-sync requires a fresh uncommitted-changes review with captured repository identity.",
      );
    const before = await this.repository();
    if (
      before.branch !== previousReview.repositoryState.branch ||
      before.head !== previousReview.repositoryState.head ||
      before.head !== previousReview.source.base
    )
      throw new Error(
        "Re-sync requires the same Git branch and HEAD. Create a new review for this repository state.",
      );
    const current = await collectSnapshot({
      cwd: root,
      source: { kind: "working-tree" },
      allowPath: (path) =>
        allowsSourcePath(readProjectPolicy(this.store, root), path),
    });
    const allowed = (file: SavedReviewSchema["files"][number]) =>
      allowsSourcePath(readProjectPolicy(this.store, root), file.path) &&
      (!file.oldPath ||
        allowsSourcePath(readProjectPolicy(this.store, root), file.oldPath));
    const baseline = (
      previousReview.syncBaseline ?? previousReview.files
    ).filter(allowed);
    const newer = await resyncSnapshot(root, baseline, current);
    const snapshot =
      mode === "keep"
        ? await resyncSnapshot(
            root,
            baseline,
            current,
            previousReview.files.filter(allowed),
          )
        : newer;
    const after = await this.repository();
    if (
      before.head !== after.head ||
      before.branch !== after.branch ||
      before.fingerprint !== after.fingerprint
    )
      throw new Error(
        "Repository changed during re-sync. Retry to freeze a consistent snapshot.",
      );
    const savedReview = this.store.saveReview(
      root,
      {
        ...snapshot,
        id: mode === "keep" ? id : randomUUID(),
        protocolVersion: PROTOCOL_VERSION,
      },
      after.fingerprint,
      snapshot.files.length > 0 && this.groupingEnabled(root, group),
      {
        directory: await this.callerDirectory(root, expected?.directory),
        activate: expected?.activate ?? false,
        repositoryState: after,
        previousReviewId: id,
        expectedHash: previousReview.hash,
        expectedRound: previousReview.round,
        resyncMode: mode,
        syncBaseline: current.files,
      },
    );
    this.captureContext(root, savedReview);
    return savedReview;
  };

  current = async () => {
    const root = await this.root();
    this.handoff = this.handoff
      .catch(() => {})
      .then(async () => {
        const claimedPath = `${this.options.snapshotPath}.${randomUUID()}`;
        try {
          // Claim this handoff before the CLI can publish another at the shared path.
          await rename(this.options.snapshotPath, claimedPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
          throw error;
        }
        try {
          // CLI handoffs are temporary runtime data, not assets for the server bundle.
          const info = await stat(/* turbopackIgnore: true */ claimedPath);
          if (info.size > MAX_SNAPSHOT_BYTES)
            throw new Error("Inspection exceeds the 20 MiB snapshot limit.");
          const preview = localPreviewSchema.parse(
            JSON.parse(
              await readFile(/* turbopackIgnore: true */ claimedPath, "utf8"),
            ),
          );
          // Only the CLI writes this private handoff; browser requests cannot choose a path or root.
          const repository = await this.repository().catch(() => null);
          const savedReview = this.store.saveReview(
            root,
            preview,
            preview.repositoryFingerprint ?? repository?.fingerprint ?? null,
            this.groupingEnabled(root),
            {
              directory: this.directory(),
              ...(repository &&
              preview.source.kind === "working-tree" &&
              preview.source.base === repository.head &&
              preview.repositoryFingerprint === repository.fingerprint
                ? { repositoryState: repository }
                : {}),
            },
          );
          this.captureContext(root, savedReview);
        } finally {
          await unlink(claimedPath);
        }
      });
    await this.handoff;
    return this.store.currentReview(root);
  };

  close = async () => {
    await this.operations.catch(() => {});
    await this.handoff.catch(() => {});
    await Promise.allSettled(this.contexts);
    this.store.close();
  };
}
