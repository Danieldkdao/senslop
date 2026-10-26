import { isLocalEndpoint, storedConnectionSchema } from "@senslop/contracts";
import { assignedModel } from "../../agents/lib/model-selection";
import { agentRoles } from "../../agents/schemas";
import { loadContext } from "../../../services/analysis/frozen-context";
import { WorkflowStore } from "@senslop/review-core/workflow";
import type { LocalStore } from "@senslop/review-core/storage";
import { CheckRunner } from "@senslop/review-core/checks";
import { readReviewPolicy } from "@senslop/review-core/policy";
import { UsageStore } from "@senslop/review-core/usage";
import { FixTasks } from "@senslop/review-core/fix-tasks";
import { VerificationStore } from "@senslop/review-core/verification";
import { AgentStore } from "../../agents/lib/agent-store";
import { hiddenWorkflowHistory } from "./workflow-history";

export const readWorkflow = (
  store: LocalStore,
  repository: string,
  reviewId: string,
) => {
  const workflow = new WorkflowStore(store, repository);
  workflow.requireReview(reviewId);
  const existing = new Set(
    workflow
      .findings(reviewId)
      .flatMap((finding) => finding.observations.map((item) => item.jobId)),
  );
  const jobs = new AgentStore(store, repository)
    .jobs(reviewId)
    .filter(
      (job) =>
        job.kind === "review" &&
        job.status === "completed" &&
        job.result &&
        "findings" in job.result,
    )
    .reverse();
  for (const job of jobs) {
    if (existing.has(job.id) || !job.result || !("findings" in job.result))
      continue;
    const round = workflow.round(reviewId, job.snapshotRound ?? 1);
    if (round && round.hash === job.hash)
      workflow.observe(round, job.id, job.result.findings);
    else
      workflow.observe(
        { id: reviewId, hash: job.hash, round: job.snapshotRound ?? 1 },
        job.id,
        job.result.findings,
      );
  }
  const context = store.database
    .prepare("SELECT body FROM ai_context WHERE snapshot_id=?")
    .get(reviewId);
  let suggestedCommands: string[] = [];
  try {
    const captured = context ? JSON.parse(String(context.body)) : null;
    const manifest = JSON.parse(captured?.sources?.["package.json"] ?? "null");
    if (manifest) {
      const manager =
        /^(pnpm|npm|yarn|bun)@/.exec(manifest.packageManager ?? "")?.[1] ??
        "npm";
      suggestedCommands = Object.keys(manifest.scripts ?? {})
        .filter((name) => /^[a-z\d:_-]+$/i.test(name))
        .map((name) => `${manager} run ${name}`);
    }
  } catch {}
  const hiddenTasks = hiddenWorkflowHistory(store, reviewId, "tasks");
  const hiddenChecks = hiddenWorkflowHistory(store, reviewId, "checks");
  const hiddenVerifications = hiddenWorkflowHistory(
    store,
    reviewId,
    "verification",
  );
  return {
    verifications: new VerificationStore(store, repository)
      .list(reviewId)
      .filter((item) => !hiddenVerifications.has(item.id)),
    suggestedCommands,
    findings: workflow.findings(reviewId),
    rounds: workflow
      .rounds(reviewId)
      .map(({ id, hash, round, createdAt, updatedAt }) => ({
        id,
        hash,
        round,
        createdAt,
        updatedAt,
      })),
    tasks: new FixTasks(store, repository)
      .list(reviewId)
      .filter((item) => !hiddenTasks.has(item.id)),
    checks: new CheckRunner(store, repository, "")
      .list(reviewId)
      .filter((item) => !hiddenChecks.has(item.id)),
    policy: readReviewPolicy(store, repository, reviewId),
    usage: new UsageStore(store, repository).list(reviewId),
  };
};

export const readWorkflowContext = async (
  store: LocalStore,
  repository: string,
  reviewId: string,
  path?: string | null,
) => {
  const review = new WorkflowStore(store, repository).requireReview(reviewId);
  const context = await loadContext(store, repository, review);
  const settings = new AgentStore(store, repository).settings();
  const files = [
    ...new Set([
      ...Object.keys(context.sources),
      ...Object.keys(context.before ?? {}),
    ]),
  ].sort();
  if (path && !files.includes(path))
    throw new Error("Path is outside the captured context.");
  const routes = agentRoles.map((role) => {
    const selection = assignedModel(settings, role);
    const row =
      selection &&
      store.database
        .prepare("SELECT body FROM connections WHERE id=?")
        .get(selection.connectionId);
    const connection = row
      ? storedConnectionSchema.parse(JSON.parse(String(row.body)))
      : null;
    return {
      role,
      model: selection?.name ?? null,
      endpoint: connection ? new URL(connection.baseURL).origin : null,
      local: connection ? isLocalEndpoint(connection.baseURL) : null,
    };
  });
  return {
    files,
    routes,
    limitations: context.limitations,
    selected: review.files.map((file) => file.path),
    source: path
      ? {
          before: context.before?.[path] ?? null,
          after: context.sources[path] ?? null,
        }
      : null,
  };
};
