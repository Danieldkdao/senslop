import { randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink } from "node:fs/promises";
import {
  MAX_SNAPSHOT_BYTES,
  PROTOCOL_VERSION,
  localPreviewSchema,
  sourceSelectionSchema,
} from "@senslop/contracts";
import {
  inspectRepository,
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

  inspect = async (input: unknown) => {
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
    return this.store.saveReview(
      root,
      {
        ...inspection.snapshot,
        id: randomUUID(),
        protocolVersion: PROTOCOL_VERSION,
      },
      inspection.fingerprint,
    );
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
          this.store.saveReview(
            root,
            preview,
            preview.repositoryFingerprint ?? repository?.fingerprint ?? null,
          );
        } finally {
          await unlink(claimedPath);
        }
      });
    await this.handoff;
    return this.store.currentReview(root);
  };

  close = () => this.store.close();
}
