import { assignedModel } from "../../agents/lib/model-selection";
import { AgentStore } from "../../agents/lib/agent-store";
import { freezeContext } from "../../../services/analysis/frozen-context";
import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink } from "node:fs/promises";
import {
  type ResyncMode,
  MAX_SNAPSHOT_BYTES,
  PROTOCOL_VERSION,
  localPreviewSchema,
  sourceSelectionSchema,
} from "@senslop/contracts";
import {
  inspectRepository,
  collectSnapshot,
  resyncSnapshot,
  readRepository,
  resolveRepository,
} from "@senslop/review-core/git";
import { LocalStore } from "@senslop/review-core/storage";

type LocalWorkspaceOptions = {
  repository: string;
  databasePath: string;
  snapshotPath: string;
};

export class LocalWorkspace {
  readonly store: LocalStore;
  private handoff: Promise<void> = Promise.resolve();
  constructor(private readonly options: LocalWorkspaceOptions) {
    this.store = new LocalStore(options.databasePath);
  }

  root = async () => {
    const root = await resolveRepository(this.options.repository);
    if (root !== this.options.repository)
      throw new Error(
        "The opened repository root changed. Restart the CLI in the intended repository.",
      );
    return root;
  };

  repository = async () => readRepository(await this.root());

  private groupingEnabled = (root: string, selected = true) => {
    const settings = new AgentStore(this.store, root).settings();
    if (!assignedModel(settings, "grouping")) return false;
    switch (settings.groupingMode) {
      case "always":
        return true;
      case "never":
        return false;
      case "ask":
        return selected;
    }
  };

  inspect = async (input: unknown, group?: boolean) => {
    const selection = sourceSelectionSchema.options
      .find(
        (schema) =>
          schema.shape.kind.value === (input as { kind?: string })?.kind,
      )
      ?.strict()
      .parse(input);
    if (!selection) throw new Error("Choose a supported Git selection.");
    const root = await this.root();
    const inspection = await inspectRepository(root, selection);
    const savedReview = this.store.saveReview(
      root,
      {
        ...inspection.snapshot,
        id: randomUUID(),
        protocolVersion: PROTOCOL_VERSION,
      },
      inspection.fingerprint,
      this.groupingEnabled(root, group),
      { repositoryState: inspection.repository },
    );
    await freezeContext(this.store, root, savedReview);
    return savedReview;
  };

  resync = async (id: string, mode: ResyncMode = "new", group?: boolean) => {
    const root = await this.root();
    const previousReview = this.store.currentReview(root);
    if (previousReview?.id !== id)
      throw new Error(
        "Re-sync requires the current active review. Reload and retry.",
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
    });
    const newer = await resyncSnapshot(
      root,
      previousReview.syncBaseline ?? previousReview.files,
      current,
    );
    const snapshot =
      mode === "keep"
        ? await resyncSnapshot(
            root,
            previousReview.syncBaseline ?? previousReview.files,
            current,
            previousReview.files,
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
        repositoryState: after,
        previousReviewId: id,
        expectedHash: previousReview.hash,
        expectedRound: previousReview.round,
        resyncMode: mode,
        syncBaseline: current.files,
      },
    );
    await freezeContext(this.store, root, savedReview);
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
            repository &&
              preview.source.kind === "working-tree" &&
              preview.source.base === repository.head &&
              preview.repositoryFingerprint === repository.fingerprint
              ? { repositoryState: repository }
              : {},
          );
          await freezeContext(this.store, root, savedReview);
        } finally {
          await unlink(claimedPath);
        }
      });
    await this.handoff;
    return this.store.currentReview(root);
  };

  close = () => this.store.close();
}
