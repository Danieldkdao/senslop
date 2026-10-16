import { inngest } from "./client";
import { executeJob } from "./jobs";
import { AgentStore } from "../../features/agents/lib/agent-store";
import { matchesJobSnapshot } from "../../features/agents/lib/job-snapshots";
import { getWorkspace } from "../../features/workspace/lib/server-workspace";
import { formatAiError } from "../ai/errors";
import { serverEnv } from "../../data/env/server";
import { getAiErrorDiagnostics } from "../ai/diagnostics";

const store = async () => {
  const workspace = getWorkspace();
  return new AgentStore(workspace.store, await workspace.root());
};

export const analysisJob = inngest.createFunction(
  {
    id: "analyze-changes",
    triggers: { event: "senslop/analysis.requested" },
    retries: 2,
    concurrency: [
      { limit: 2 },
      { limit: 1, key: "event.data.snapshotId + '-' + event.data.kind" },
    ],
    idempotency: "event.data.dispatchKey",
    cancelOn: [{ event: "senslop/analysis.canceled", match: "data.jobId" }],
    onFailure: async ({ event, error }) => {
      const jobId = event.data.event.data.jobId;
      console.warn("[senslop:analysis-job]", {
        event: "failed",
        jobId,
        snapshotId: event.data.event.data.snapshotId,
        ...getAiErrorDiagnostics(error),
      });
      if (typeof jobId === "string")
        (await store()).updateJob(jobId, {
          status: "failed",
          progress: "Failed — retry available",
          error: formatAiError(error),
        });
    },
  },
  async ({ event, step, runId }) => {
    if (typeof event.data.jobId !== "string") return;
    await executeJob(await store(), event.data.jobId, runId, step);
  },
);

export const dispatchJobs = async (snapshotId: string) => {
  const agents = await store();
  for (const job of agents
    .jobs(snapshotId)
    .filter((job) => job.status === "queued" && !job.dispatched)) {
    try {
      await inngest.send({
        id: `${job.id}:${serverEnv.SENSLOP_LOCAL_STARTED_AT ?? job.createdAt}`,
        name: "senslop/analysis.requested",
        data: {
          jobId: job.id,
          snapshotId,
          kind: job.kind,
          dispatchKey: `${job.id}:${serverEnv.SENSLOP_LOCAL_STARTED_AT ?? job.createdAt}`,
        },
      });
      agents.updateJob(job.id, {
        dispatched: true,
        progress: "Waiting for local worker",
      });
      console.info("[senslop:analysis-job]", {
        event: "dispatched",
        jobId: job.id,
        snapshotId,
        kind: job.kind,
      });
    } catch (error) {
      console.warn("[senslop:analysis-job]", {
        event: "dispatch-failed",
        jobId: job.id,
        snapshotId,
        kind: job.kind,
        ...getAiErrorDiagnostics(error),
      });
      agents.updateJob(job.id, {
        error:
          "Local job engine is unavailable. Keep the CLI running; dispatch will retry automatically.",
      });
    }
  }
};

export const resumeJobs = async () => {
  const agents = await store();
  if (serverEnv.SENSLOP_LOCAL_STARTED_AT)
    agents.recoverJobs(serverEnv.SENSLOP_LOCAL_STARTED_AT);
  for (const snapshotId of new Set(
    agents.pendingJobs().map((job) => job.snapshotId),
  ))
    await dispatchJobs(snapshotId);
};

export const scheduleGrouping = async (snapshotId: string) => {
  const agents = await store();
  const snapshot = agents.snapshot(snapshotId);
  if (
    snapshot.groupingEnabled !== false &&
    snapshot.files.length > 0 &&
    !agents
      .jobs(snapshotId)
      .some(
        (job) => job.kind === "grouping" && matchesJobSnapshot(job, snapshot),
      ) &&
    (await import("../ai/repository-agent")).assignedModel(
      agents.settings(),
      "grouping",
    )
  )
    agents.createJob(snapshotId, "grouping");
  await dispatchJobs(snapshotId);
};
