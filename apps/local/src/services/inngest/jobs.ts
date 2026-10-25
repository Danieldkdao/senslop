import { prepareIncrementalGrouping } from "../ai/incremental-grouping";
import { formatAiError, isFatalAiError } from "../ai/errors";
import { NonRetriableError, RetryAfterError } from "inngest";
import { analysisRetryDelaysMs } from "../../features/agents/constants";
import { AgentStore } from "../../features/agents/lib/agent-store";
import { matchesJobSnapshot } from "../../features/agents/lib/job-snapshots";
import { assignedModel, createRepositoryAgent } from "../ai/repository-agent";
import { loadContext } from "../analysis/frozen-context";
import { getAiErrorDiagnostics } from "../ai/diagnostics";
import type {
  GroupingSchema,
  CorrectnessSchema,
} from "../../features/agents/schemas";

type DurableSteps = {
  run: (
    name: string,
    operation: () => Promise<boolean | GroupingSchema | CorrectnessSchema>,
  ) => Promise<unknown>;
};

const retryJob = (
  store: AgentStore,
  id: string,
  error: unknown,
  attempt: number,
): never => {
  const delayMs = analysisRetryDelaysMs[attempt];
  const message = formatAiError(error);
  if (isFatalAiError(error) || delayMs === undefined)
    throw new NonRetriableError(message);
  const retryAt = new Date(Date.now() + delayMs);
  store.updateJob(id, {
    progress: "Retrying analysis",
    error: message,
    retryAt: retryAt.toISOString(),
  });
  throw new RetryAfterError(message, retryAt);
};

export const executeJob = async (
  store: AgentStore,
  id: string,
  runId: string,
  step: DurableSteps,
  attempt = 0,
  dispatchKey?: string,
) => {
  if (dispatchKey)
    store = new AgentStore(store.local, store.repository, {
      id,
      key: dispatchKey,
    });
  const job = store.job(id);
  if (!job || ["canceled", "completed", "failed"].includes(job.status)) return;
  const snapshot = store.snapshot(job.snapshotId);
  if (!matchesJobSnapshot(job, snapshot))
    throw new NonRetriableError("Snapshot identity changed.");
  const selection = assignedModel(job.settings, job.kind);
  if (!selection)
    throw new NonRetriableError(
      "Choose task models in Settings → AI, then retry.",
    );
  const diagnosticContext = {
    jobId: id,
    runId,
    snapshotId: job.snapshotId,
    kind: job.kind,
    modelId: selection.modelId,
  };
  console.info("[senslop:analysis-job]", {
    ...diagnosticContext,
    event: "started",
    hasAnalysisCheckpoint: !!job.result,
  });
  await step.run("prepare-context", async () => {
    const currentJob = store.job(id);
    if (
      !currentJob ||
      ["canceled", "completed", "failed"].includes(currentJob.status)
    )
      throw new NonRetriableError("Job canceled or superseded.");
    store.updateJob(id, {
      status: "running",
      progress: "Collecting frozen context",
      runId,
      error: null,
      retryAt: null,
      fallbackAt: null,
    });
    const startedAt = performance.now();
    console.info("[senslop:analysis-job]", {
      ...diagnosticContext,
      event: "context-started",
    });
    try {
      await loadContext(store.local, store.repository, snapshot);
      console.info("[senslop:analysis-job]", {
        ...diagnosticContext,
        event: "context-completed",
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      console.warn("[senslop:analysis-job]", {
        ...diagnosticContext,
        event: "context-failed",
        durationMs: Math.round(performance.now() - startedAt),
        retryDecision: "stop-automatic-retries",
        ...getAiErrorDiagnostics(error),
      });
      throw new NonRetriableError((error as Error).message);
    }
    return true;
  });
  const result =
    job.result ??
    (await step.run("analyze", async () => {
      const currentJob = store.job(id);
      if (
        !currentJob ||
        ["canceled", "completed", "failed"].includes(currentJob.status)
      )
        throw new NonRetriableError("Job canceled or superseded.");
      const startedAt = performance.now();
      const abort = new AbortController();
      const timer = setInterval(() => {
        const current = store.job(id);
        if (!current || current.status === "canceled") abort.abort();
      }, 1000);
      timer.unref();
      try {
        store.updateJob(id, {
          progress:
            job.kind === "grouping"
              ? "Ordering changes and writing summaries"
              : "Checking changes and evidence",
        });
        const context = await loadContext(
          store.local,
          store.repository,
          snapshot,
        );
        const previous =
          job.kind === "grouping" &&
          snapshot.resyncMode === "keep" &&
          (context.previousReview || snapshot.previousReviewId) &&
          !store
            .jobs(snapshot.id)
            .some(
              (run) =>
                run.id !== id &&
                run.kind === "grouping" &&
                matchesJobSnapshot(run, snapshot) &&
                run.status === "completed",
            )
            ? (context.previousReview ??
              (snapshot.previousReviewId
                ? store.local.getReview(
                    store.repository,
                    snapshot.previousReviewId,
                  )
                : null))
            : null;
        const previousGrouping = previous
          ? store
              .jobs(previous.id)
              .find(
                (job) =>
                  job.kind === "grouping" &&
                  matchesJobSnapshot(job, previous) &&
                  job.status === "completed",
              )?.result
          : null;
        const groupingSeed =
          previous && previousGrouping && "groups" in previousGrouping
            ? prepareIncrementalGrouping(snapshot, previous, previousGrouping)
            : undefined;
        const agent = await createRepositoryAgent({
          groupingSeed,
          local: store.local,
          snapshot,
          context,
          settings: job.settings,
          selection,
          signal: abort.signal,
          onProgress: (progress) => store.updateJob(id, { progress }),
          diagnostics: { jobId: id, runId },
          checkpoint: {
            read: (key) => store.readCheckpoint(id, key),
            write: (key, value) => {
              if (!store.writeCheckpoint(id, key, value)) abort.abort();
            },
          },
        });
        const analysis = await (job.kind === "grouping"
          ? agent.grouping()
          : agent.review());
        store.updateJob(id, { result: analysis });
        console.info("[senslop:analysis-job]", {
          ...diagnosticContext,
          event: "analysis-checkpoint-saved",
          durationMs: Math.round(performance.now() - startedAt),
        });
        return analysis;
      } catch (error) {
        const canceled = abort.signal.aborted;
        const fatal = isFatalAiError(error);
        console.warn("[senslop:analysis-job]", {
          ...diagnosticContext,
          event: "analysis-failed",
          durationMs: Math.round(performance.now() - startedAt),
          canceled,
          fatal,
          retryDecision: canceled
            ? "canceled"
            : fatal || attempt >= analysisRetryDelaysMs.length
              ? "stop-automatic-retries"
              : "inngest-retry",
          ...getAiErrorDiagnostics(error),
        });
        if (abort.signal.aborted) throw new NonRetriableError("Canceled.");
        return retryJob(store, id, error, attempt);
      } finally {
        clearInterval(timer);
      }
    }));
  await step.run("publish", async () => {
    try {
      const published = store.publish(
        id,
        result as GroupingSchema | CorrectnessSchema,
      );
      console.info("[senslop:analysis-job]", {
        ...diagnosticContext,
        event: published ? "published" : "publish-skipped",
      });
      return published;
    } catch (error) {
      console.warn("[senslop:analysis-job]", {
        ...diagnosticContext,
        event: "publish-failed",
        ...getAiErrorDiagnostics(error),
      });
      return retryJob(store, id, error, attempt);
    }
  });
};
