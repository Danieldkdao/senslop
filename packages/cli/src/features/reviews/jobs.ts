import { setTimeout as sleep } from "node:timers/promises";
import { CliError } from "../commands/errors.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import type { ReviewJob } from "./types.js";

export const waitForJob = async (
  client: WorkspaceClient,
  id: string,
  timeout = 600,
) => {
  const deadline = Date.now() + timeout * 1000;
  const signal = AbortSignal.timeout(timeout * 1000);
  try {
    while (Date.now() < deadline) {
      const job = await client.request<ReviewJob>(
        `/api/agents?jobId=${encodeURIComponent(id)}`,
        undefined,
        "GET",
        signal,
      );
      if (job.status === "completed") return job;
      if (job.status === "failed" || job.status === "canceled")
        throw new CliError(
          job.error ?? `Analysis ${job.status}.`,
          "analysis_failed",
          4,
          { jobId: id, snapshotId: job.snapshotId, status: job.status },
        );
      await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
  throw new CliError(
    "Timed out waiting for analysis. The job continues in the app; use runs watch to reconnect.",
    "timeout",
    5,
    { jobId: id },
  );
};

export const startJob = (
  client: WorkspaceClient,
  snapshotId: string,
  kind: ReviewJob["kind"],
) =>
  client.request<ReviewJob>("/api/agents", { action: "job", snapshotId, kind });

export const readAllJobs = async (
  client: WorkspaceClient,
  snapshotId: string,
) => {
  const jobs: ReviewJob[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: { items: ReviewJob[]; next: number | null } =
      await client.request(
        `/api/agents?snapshotId=${encodeURIComponent(snapshotId)}&history=jobs&offset=${offset}&limit=100`,
      );
    jobs.push(...page.items);
    offset = page.next;
  }
  return jobs;
};
