import type { SavedReviewSchema } from "@senslop/contracts";
import type { JobSchema } from "../schemas";

export const matchesJobSnapshot = (
  job: Pick<JobSchema, "hash" | "snapshotRound">,
  snapshot: Pick<Partial<SavedReviewSchema>, "hash" | "round">,
) =>
  job.hash === snapshot.hash &&
  (job.snapshotRound ?? 1) === (snapshot.round ?? 1);
