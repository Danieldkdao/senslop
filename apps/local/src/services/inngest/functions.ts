import { inngest } from "./client";
import { executeJob } from "./jobs";
import { analysisRetryDelaysMs } from "../../features/agents/constants";
import { AgentStore } from "../../features/agents/lib/agent-store";
import { matchesJobSnapshot } from "../../features/agents/lib/job-snapshots";
import { getWorkspace } from "../../features/workspace/lib/server-workspace";
import { formatAiError } from "../ai/errors";
import { serverEnv } from "../../data/env/server";
import { getAiErrorDiagnostics } from "../ai/diagnostics";
import type { JobPriority } from "../../features/agents/schemas";
import { CheckRunner } from "@senslop/review-core/checks";
import { VerificationStore } from "@senslop/review-core/verification";
import { verifyFindings } from "../../features/workflow/lib/verify-findings";
import { dirname, join } from "node:path";
import { maintainProjectData } from "@senslop/review-core/maintenance";

export const getCheckRunner = async () => {
  const workspace = getWorkspace();
  return new CheckRunner(
    workspace.store,
    await workspace.root(),
    join(dirname(serverEnv.SENSLOP_LOCAL_DATABASE!), "execution"),
  );
};

export const verificationJob = inngest.createFunction(
  {
    id: "verify-findings",
    triggers: { event: "senslop/verification.requested" },
    retries: 0,
    concurrency: { limit: 2 },
    idempotency: "event.data.verificationId",
    onFailure: async ({ event, error }) => {
      const workspace = getWorkspace();
      const runs = new VerificationStore(
        workspace.store,
        await workspace.root(),
      );
      const run = runs.get(String(event.data.event.data.verificationId));
      if (run && ["queued", "running"].includes(run.status))
        runs.save({
          ...run,
          ownerPid: null,
          status: "failed",
          error: error.message,
        });
    },
  },
  async ({ event, step }) =>
    await step.run("verify-source", async () => {
      const workspace = getWorkspace();
      return await verifyFindings(
        workspace.store,
        await workspace.root(),
        String(event.data.verificationId),
      );
    }),
);

export const dispatchVerifications = async () => {
  const workspace = getWorkspace();
  const repository = await workspace.root();
  for (const row of workspace.store.database
    .prepare(
      "SELECT v.id FROM finding_verifications v JOIN reviews r ON r.id=v.review_id WHERE r.repository=? AND json_extract(v.body,'$.status')='queued'",
    )
    .all(repository))
    await inngest.send({
      id: String(row.id),
      name: "senslop/verification.requested",
      data: { verificationId: String(row.id) },
    });
};

export const checkJob = inngest.createFunction(
  {
    id: "execute-project-check",
    triggers: { event: "senslop/check.requested" },
    retries: 0,
    concurrency: { limit: 1 },
    idempotency: "event.data.checkId",
    onFailure: async ({ event, error }) => {
      const runner = await getCheckRunner();
      runner.store.transaction(() => {
        const run = runner.get(String(event.data.event.data.checkId));
        if (run && ["queued", "running"].includes(run.status))
          runner.save({ ...run, status: "interrupted", error: error.message });
      });
    },
  },
  async ({ event, step }) => {
    const id = String(event.data.checkId);
    return await step.run(
      "run-command",
      async () => await (await getCheckRunner()).run(id),
    );
  },
);

export const dispatchChecks = async () => {
  const runner = await getCheckRunner();
  for (const row of runner.store.database
    .prepare(
      "SELECT c.id,c.body FROM check_runs c JOIN reviews r ON r.id=c.review_id WHERE r.repository=? AND json_extract(c.body,'$.status')='queued'",
    )
    .all(runner.repository))
    await inngest.send({
      id: String(row.id),
      name: "senslop/check.requested",
      data: { checkId: String(row.id) },
    });
};

const store = async () => {
  const workspace = getWorkspace();
  return new AgentStore(workspace.store, await workspace.root());
};

export const analysisJob = inngest.createFunction(
  {
    id: "analyze-changes",
    triggers: { event: "senslop/analysis.requested" },
    retries: analysisRetryDelaysMs.length,
    concurrency: [
      { limit: 2 },
      { limit: 1, key: "event.data.snapshotId + '-' + event.data.kind" },
    ],
    idempotency: "event.data.dispatchKey",
    priority: { run: "event.data.priority == 'high' ? 120 : 0" },
    cancelOn: [
      { event: "senslop/analysis.canceled", match: "data.dispatchKey" },
    ],
    onFailure: async ({ event, error }) => {
      const jobId = event.data.event.data.jobId;
      if (
        serverEnv.SENSLOP_LOCAL_STARTED_AT &&
        !String(event.data.event.data.dispatchKey).startsWith(
          `${jobId}:${serverEnv.SENSLOP_LOCAL_STARTED_AT}:`,
        )
      )
        return;
      console.warn("[senslop:analysis-job]", {
        event: "failed",
        jobId,
        snapshotId: event.data.event.data.snapshotId,
        ...getAiErrorDiagnostics(error),
      });
      if (typeof jobId === "string") {
        const agents = await store();
        if (
          agents.job(jobId)?.dispatchKey === event.data.event.data.dispatchKey
        )
          agents.failJob(jobId, formatAiError(error));
      }
    },
  },
  async ({ event, step, runId, attempt }) => {
    if (typeof event.data.jobId !== "string") return;
    if (
      serverEnv.SENSLOP_LOCAL_STARTED_AT &&
      !String(event.data.dispatchKey).startsWith(
        `${event.data.jobId}:${serverEnv.SENSLOP_LOCAL_STARTED_AT}:`,
      )
    )
      return;
    await executeJob(
      await store(),
      event.data.jobId,
      runId,
      step,
      attempt,
      event.data.dispatchKey,
    );
  },
);

export const dispatchJobs = async (snapshotId: string) => {
  const agents = await store();
  for (const job of agents
    .jobs(snapshotId)
    .filter((job) => job.status === "queued" && !job.dispatched)) {
    const dispatchKey = `${job.id}:${serverEnv.SENSLOP_LOCAL_STARTED_AT ?? job.createdAt}:${job.dispatchGeneration}`;
    const claimedJob = agents.claimDispatch(
      job.id,
      job.dispatchGeneration,
      dispatchKey,
    );
    if (!claimedJob) continue;
    // A failed old send must not release or modify a newer generation's claim.
    const delivery = new AgentStore(agents.local, agents.repository, {
      id: claimedJob.id,
      key: dispatchKey,
    });
    try {
      await inngest.send({
        id: dispatchKey,
        name: "senslop/analysis.requested",
        data: {
          jobId: claimedJob.id,
          snapshotId,
          kind: claimedJob.kind,
          dispatchKey,
          priority: claimedJob.priority,
        },
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
      delivery.updateJob(job.id, {
        dispatched: false,
        error:
          "Local job engine is unavailable. Keep the CLI running; dispatch will retry automatically.",
      });
    }
  }
};

let lastMaintenance = 0;

export const resumeJobs = async () => {
  const agents = await store();
  if (Date.now() - lastMaintenance > 60_000) {
    lastMaintenance = Date.now();
    await maintainProjectData(agents.local, agents.repository);
  }
  if (serverEnv.SENSLOP_LOCAL_STARTED_AT)
    agents.recoverJobs(serverEnv.SENSLOP_LOCAL_STARTED_AT);
  for (const snapshotId of new Set(
    agents.pendingJobs().map((job) => job.snapshotId),
  ))
    await dispatchJobs(snapshotId);
  const runner = await getCheckRunner();
  for (const row of runner.store.database
    .prepare(
      "SELECT c.id FROM check_runs c JOIN reviews r ON r.id=c.review_id WHERE r.repository=? AND (json_extract(c.body,'$.status')='running' OR json_extract(c.body,'$.ownerPid') IS NOT NULL)",
    )
    .all(runner.repository)) {
    const run = runner.get(String(row.id));
    let alive = false;
    if (run?.ownerPid)
      try {
        process.kill(run.ownerPid, 0);
        alive = true;
      } catch {}
    if (run && !alive)
      runner.store.transaction(() => {
        const current = runner.get(run.id);
        if (!current || current.ownerPid !== run.ownerPid) return;
        runner.save({
          ...current,
          ownerPid: null,
          status: current.status === "running" ? "interrupted" : current.status,
          error:
            current.status === "running"
              ? "Owner restarted during command execution. Review the previous output before explicitly rerunning."
              : current.error,
        });
      });
  }
  await dispatchChecks();
  const verifications = new VerificationStore(runner.store, runner.repository);
  for (const row of runner.store.database
    .prepare(
      "SELECT v.id FROM finding_verifications v JOIN reviews r ON r.id=v.review_id WHERE r.repository=? AND json_extract(v.body,'$.status')='running'",
    )
    .all(runner.repository)) {
    const run = verifications.get(String(row.id));
    let alive = false;
    if (run?.ownerPid)
      try {
        process.kill(run.ownerPid, 0);
        alive = true;
      } catch {}
    if (run && !alive)
      runner.store.transaction(() => {
        const current = verifications.get(run.id);
        if (current?.status !== "running" || current.ownerPid !== run.ownerPid)
          return;
        verifications.save({
          ...current,
          ownerPid: null,
          status: "failed",
          error: "Owner restarted during verification. Run verification again.",
        });
      });
  }
  await dispatchVerifications();
};

export const scheduleGrouping = async (
  snapshotId: string,
  priority?: JobPriority,
) => {
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
    agents.createJob(snapshotId, "grouping", { priority });
  await dispatchJobs(snapshotId);
};
