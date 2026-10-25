import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import { AgentStore } from "../../../features/agents/lib/agent-store";
import { agentActionSchema } from "../../../features/agents/schemas";
import { assignedModel } from "../../../services/ai/repository-agent";
import {
  dispatchJobs,
  scheduleGrouping,
} from "../../../services/inngest/functions";
import { serverEnv } from "../../../data/env/server";
import { inngest } from "../../../services/inngest/client";
import {
  fixAllPrompt,
  findingFixPrompt,
} from "../../../features/agents/lib/validate-results";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const agents = new AgentStore(workspace.store, await workspace.root());
    if (new URL(request.url).searchParams.get("queue") === "1")
      return Response.json(
        agents.pendingJobs().sort((left, right) => {
          const leftOrder =
            Date.parse(left.createdAt) -
            (left.priority === "high" ? 120000 : 0);
          const rightOrder =
            Date.parse(right.createdAt) -
            (right.priority === "high" ? 120000 : 0);
          return leftOrder - rightOrder;
        }),
      );
    if (serverEnv.SENSLOP_LOCAL_STARTED_AT)
      agents.recoverForeground(serverEnv.SENSLOP_LOCAL_STARTED_AT);
    const snapshotId = new URL(request.url).searchParams.get("snapshotId");
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (jobId) {
      const existingJob = agents.job(jobId);
      if (
        existingJob?.kind === "review" &&
        existingJob.result &&
        "findings" in existingJob.result &&
        new URL(request.url).searchParams.get("format") === "fix-prompts"
      ) {
        const result = existingJob.result;
        return Response.json({
          ...existingJob,
          result: {
            ...result,
            fixAllPrompt: result.findings.length
              ? fixAllPrompt(existingJob.snapshotId, result)
              : "No fixes needed.",
            findings: result.findings.map((finding) => ({
              ...finding,
              fixPrompt: findingFixPrompt(finding),
            })),
          },
        });
      }
      return existingJob
        ? Response.json(existingJob)
        : Response.json(
            { message: "Job not found in this repository." },
            { status: 404 },
          );
    }
    const conversationId = new URL(request.url).searchParams.get(
      "conversationId",
    );
    if (conversationId) {
      const conversation = agents.conversation(conversationId);
      if (!conversation) throw new Error("Conversation not found.");
      return Response.json(conversation);
    }
    if (!snapshotId) throw new Error("Choose a snapshot.");
    const parameters = new URL(request.url).searchParams;
    const history = parameters.get("history");
    if (history === "jobs") {
      const offset = Number(parameters.get("offset") ?? 0);
      const limit = Number(parameters.get("limit") ?? 50);
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        throw new Error("Invalid history page.");
      return Response.json(
        agents.jobHistory(
          snapshotId,
          offset,
          limit,
          parameters.get("search") ?? "",
        ),
      );
    }
    if (history === "reviews" || history === "conversations") {
      const offset = Number(parameters.get("offset") ?? "0");
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new Error("Invalid history page.");
      return Response.json(
        agents.history(
          snapshotId,
          history,
          offset,
          parameters.get("search") ?? "",
        ),
      );
    }
    await scheduleGrouping(snapshotId);
    return Response.json({
      jobs: agents.jobs(snapshotId),
      conversations: agents.conversations(snapshotId),
    });
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const input = agentActionSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const agents = new AgentStore(workspace.store, await workspace.root());
    switch (input.action) {
      case "retry": {
        const previousJob = agents.job(input.id);
        if (!previousJob) throw new Error("Job not found.");
        const job = agents.createJob(previousJob.snapshotId, previousJob.kind, {
          retryOf: previousJob.id,
        });
        await dispatchJobs(job.snapshotId);
        return Response.json(job);
      }
      case "priority": {
        const previousJob = agents.job(input.id);
        const job = agents.prioritizeJob(input.id, input.priority);
        if (previousJob?.dispatchKey)
          await inngest
            .send({
              name: "senslop/analysis.canceled",
              data: { jobId: input.id, dispatchKey: previousJob.dispatchKey },
            })
            .catch(() => {});
        await dispatchJobs(job.snapshotId);
        return Response.json(job);
      }
      case "rename-review":
        return Response.json(agents.renameReview(input.id, input.title));
      case "delete-review":
        agents.deleteReview(input.id);
        return Response.json({ saved: true });
      case "job": {
        const snapshot = agents.snapshot(input.snapshotId);
        if (
          (input.expectedHash !== undefined &&
            snapshot.hash !== input.expectedHash) ||
          (input.expectedRound !== undefined &&
            snapshot.round !== input.expectedRound)
        )
          throw new Error("Review contents changed. Reload and retry.");
        if (
          input.kind === "review" &&
          snapshot.source.kind === "working-tree"
        ) {
          const repository = await workspace.repository();
          if (
            !snapshot.fingerprint ||
            !repository.fingerprint ||
            snapshot.fingerprint !== repository.fingerprint
          )
            throw new Error(
              "Re-sync your changes before running a review. The repository no longer matches this snapshot.",
            );
        }
        if (!assignedModel(agents.settings(), input.kind))
          throw new Error("Choose task models in Settings → AI first.");
        if (input.kind === "grouping")
          workspace.store.enableGrouping(agents.repository, input.snapshotId);
        const job = agents.createJob(input.snapshotId, input.kind, {
          hash: input.expectedHash,
          round: input.expectedRound,
          priority: input.priority,
        });
        await dispatchJobs(input.snapshotId);
        return Response.json(job);
      }
      case "cancel": {
        const job = agents.job(input.id);
        if (!job) throw new Error("Job not found.");
        agents.updateJob(input.id, {
          status: "canceled",
          progress: "Canceled",
        });
        await inngest
          .send({
            name: "senslop/analysis.canceled",
            data: { jobId: input.id, dispatchKey: job.dispatchKey },
          })
          .catch(() => {});
        return Response.json({ saved: true });
      }
      case "create":
        return Response.json(agents.createConversation(input.snapshotId));
      case "rename":
        return Response.json(agents.renameConversation(input.id, input.title));
      case "delete":
        agents.deleteConversation(input.id);
        return Response.json({ saved: true });
    }
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      {
        status: /Review contents changed/.test((error as Error).message)
          ? 409
          : 400,
      },
    );
  }
};
