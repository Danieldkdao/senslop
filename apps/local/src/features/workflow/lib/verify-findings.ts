import {
  readProjectPolicy,
  allowsSourcePath,
  WorkflowPolicyError,
} from "@senslop/review-core/policy";
import { VerificationStore } from "@senslop/review-core/verification";
import { WorkflowStore } from "@senslop/review-core/workflow";
import type { LocalStore } from "@senslop/review-core/storage";
import { AgentStore } from "../../agents/lib/agent-store";
import { assignedModel } from "../../agents/lib/model-selection";
import { loadContext } from "../../../services/analysis/frozen-context";
import { createRepositoryAgent } from "../../../services/ai/repository-agent";

export const verifyFindings = async (
  store: LocalStore,
  repository: string,
  id: string,
) => {
  const runs = new VerificationStore(store, repository);
  const run = runs.get(id);
  if (!run || run.status !== "queued") return run;
  const claimed = store.transaction(() => {
    const current = runs.get(id);
    return current?.status === "queued"
      ? runs.save({ ...current, status: "running", ownerPid: process.pid })
      : null;
  });
  if (!claimed) return runs.get(id);
  const abort = new AbortController();
  const timer = setInterval(() => {
    const current = runs.get(id);
    if (!current || current.status === "canceled") abort.abort();
  }, 500);
  timer.unref();
  try {
    const workflow = new WorkflowStore(store, repository);
    const review = workflow.requireReview(run.review.id, run.review);
    const settings = new AgentStore(store, repository).settings();
    const selection = assignedModel(settings, "review");
    if (!selection)
      throw new Error("Choose a Review model in AI settings first.");
    const context = await loadContext(store, repository, review);
    const agent = await createRepositoryAgent({
      local: store,
      snapshot: review,
      context,
      settings,
      selection,
      signal: abort.signal,
      task: "verification",
    });
    const findings = workflow.findings(review.id);
    const assessments = [];
    for (const findingId of run.findingIds) {
      abort.signal.throwIfAborted();
      const finding = findings.find((item) => item.id === findingId);
      if (!finding) throw new Error("Finding no longer exists.");
      if (
        !allowsSourcePath(
          readProjectPolicy(store, repository),
          finding.observations.at(-1)!.evidence.path,
        )
      )
        throw new WorkflowPolicyError(
          "Source policy blocks the original finding evidence. It remains unverified.",
        );
      assessments.push({
        findingId,
        ...(await agent.verify(finding.observations.at(-1)!.evidence)),
      });
      if (runs.get(id)?.status === "canceled") return runs.get(id);
      runs.save({ ...claimed, assessments: [...assessments] });
    }
    abort.signal.throwIfAborted();
    return runs.publish(run.id, assessments);
  } catch (error) {
    const current = runs.get(id);
    if (current?.status === "canceled") return current;
    return runs.save({
      ...(current ?? claimed),
      ownerPid: null,
      status: "failed",
      error: (error as Error).message,
    });
  } finally {
    clearInterval(timer);
  }
};
