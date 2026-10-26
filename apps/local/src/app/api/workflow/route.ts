import { localBytes } from "@senslop/review-core/git";
import {
  readExecutionManifest,
  hashExecutionBytes,
} from "@senslop/review-core/execution";
import {
  readProjectPolicy,
  allowsSourcePath,
} from "@senslop/review-core/policy";
import { z } from "zod";
import { WorkflowStore } from "@senslop/review-core/workflow";
import { reviewIdentitySchema } from "@senslop/contracts";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import {
  readWorkflow,
  readWorkflowContext,
} from "../../../features/workflow/lib/workflow-service";
import { workflowActionSchema } from "../../../features/workflow/schemas";
import { FixTasks } from "@senslop/review-core/fix-tasks";
import {
  prepareFixTask,
  captureFixChanges,
} from "@senslop/review-core/fix-changes";
import {
  saveProjectPolicy,
  saveReviewLimits,
} from "@senslop/review-core/policy";
import { readRepository } from "@senslop/review-core/git";
import {
  getCheckRunner,
  dispatchChecks,
  dispatchVerifications,
} from "../../../services/inngest/functions";
import { VerificationStore } from "@senslop/review-core/verification";
import { removeWorkflowHistory } from "../../../features/workflow/lib/workflow-history";

const requestSchema = z.object({
  review: reviewIdentitySchema,
  operation: workflowActionSchema,
});
export type RequestSchema = z.infer<typeof requestSchema>;
export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const params = new URL(request.url).searchParams;
    if (params.has("checkId")) {
      const run = (await getCheckRunner()).get(
        z.uuid().parse(params.get("checkId")),
      );
      if (!run)
        return Response.json({ message: "Check not found." }, { status: 404 });
      if (params.has("artifact")) {
        const artifact = run.artifacts.find(
          (item) => item.path === params.get("artifact"),
        );
        if (
          !artifact?.hash ||
          !run.manifestId ||
          !allowsSourcePath(
            readProjectPolicy(workspace.store, root),
            artifact.path,
          )
        )
          throw new Error("Artifact unavailable or excluded.");
        const manifest = readExecutionManifest(
          workspace.store,
          root,
          run.manifestId,
        );
        const file = await localBytes(
          manifest.directory,
          artifact.path,
          1024 * 1024,
        );
        if (!file.bytes || hashExecutionBytes(file.bytes) !== artifact.hash)
          throw new Error(
            "Artifact changed or expired. Its recorded metadata remains available.",
          );
        return new Response(new Uint8Array(file.bytes), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(artifact.path.split("/").at(-1)!)}"`,
          },
        });
      }
      return Response.json(run);
    }
    if (params.has("taskId")) {
      const taskId = z.uuid().parse(params.get("taskId"));
      const tasks = new FixTasks(workspace.store, root);
      return Response.json({
        task: tasks.requireTask(taskId),
        ...(params.has("prompt") ? { prompt: tasks.prompt(taskId) } : {}),
      });
    }
    const reviewId = z.uuid().parse(params.get("reviewId"));
    if (params.has("context"))
      return Response.json(
        await readWorkflowContext(
          workspace.store,
          root,
          reviewId,
          params.get("path"),
        ),
      );
    if (params.has("round")) {
      const round = new WorkflowStore(workspace.store, root).round(
        reviewId,
        z.coerce.number().int().positive().parse(params.get("round")),
      );
      if (!round)
        return Response.json(
          { message: "Round evidence is unavailable." },
          { status: 404 },
        );
      return Response.json(round);
    }
    return Response.json(readWorkflow(workspace.store, root, reviewId));
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
    const input = requestSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const root = await workspace.root();
    const workflow = new WorkflowStore(workspace.store, root);
    const operation = input.operation;
    const tasks = new FixTasks(workspace.store, root);
    switch (operation.action) {
      case "remove-history":
        return Response.json(
          removeWorkflowHistory(
            workspace.store,
            root,
            input.review.id,
            operation.kind,
            operation.id,
          ),
        );
      case "verify-findings": {
        const run = new VerificationStore(workspace.store, root).create(
          input.review,
          operation.findingIds,
        );
        await dispatchVerifications().catch(() => {});
        return Response.json(run);
      }
      case "cancel-verification": {
        const runs = new VerificationStore(workspace.store, root);
        const run = runs.get(operation.verificationId);
        if (run?.review.id !== input.review.id)
          throw new Error("Verification not found in this review.");
        return Response.json(runs.cancel(run.id));
      }
      case "save-review-limits":
        workflow.requireReview(input.review.id, input.review);
        return Response.json(
          saveReviewLimits(
            workspace.store,
            root,
            input.review.id,
            operation.limits,
          ),
        );
      case "save-policy":
        workflow.requireReview(input.review.id, input.review);
        return Response.json(
          saveProjectPolicy(workspace.store, root, operation.policy),
        );
      case "create-task": {
        const snapshot = workflow.requireReview(input.review.id, input.review);
        if (
          snapshot.source.kind !== "working-tree" ||
          (await readRepository(root)).fingerprint !== snapshot.fingerprint
        )
          throw new Error(
            "Repository changed. Capture a fresh working-tree review before requesting edits.",
          );
        const task = tasks.create(input.review, operation);
        return Response.json(
          await prepareFixTask(
            workspace.store,
            root,
            task,
            (await getCheckRunner()).parent,
          ),
        );
      }
      case "claim-task": {
        const task = tasks.requireTask(operation.taskId, input.review);
        if (
          task.workspaceKind === "current" &&
          (await readRepository(root)).fingerprint !==
            workflow.requireReview(input.review.id, input.review).fingerprint
        )
          throw new Error(
            "Repository changed before the agent claim. Re-sync and reassess.",
          );
        return Response.json(
          tasks.claim(task.id, operation.agent, input.review),
        );
      }
      case "return-task":
        return Response.json(
          await captureFixChanges(
            workspace.store,
            root,
            operation.taskId,
            input.review,
          ),
        );
      case "cancel-task":
        return Response.json(
          tasks.transition(operation.taskId, "canceled", input.review),
        );
      case "fail-task":
        return Response.json(
          tasks.transition(
            operation.taskId,
            "failed",
            input.review,
            operation.message,
          ),
        );
      case "review-task":
        return Response.json(
          tasks.transition(
            operation.taskId,
            "reviewed",
            input.review,
            "Returned changes reviewed; findings remain independent",
          ),
        );
      case "apply-task":
        return Response.json(
          await workspace.applyTask(
            operation.taskId,
            input.review,
            operation.paths,
          ),
        );
      case "start-check": {
        const run = (await getCheckRunner()).create(input.review, operation);
        await dispatchChecks().catch(() => {});
        return Response.json(run);
      }
      case "cancel-check": {
        workflow.requireReview(input.review.id);
        const runner = await getCheckRunner();
        const run = runner.get(operation.checkId);
        if (!run || run.review.id !== input.review.id)
          throw new Error("Check not found in this review.");
        return Response.json(runner.cancel(operation.checkId));
      }
      case "decision":
        return Response.json(
          workflow.decide(
            input.review.id,
            operation.findingId,
            operation.decision,
            operation.reason,
            input.review,
          ),
        );
      case "link":
        return Response.json(
          workflow.link(
            input.review.id,
            operation.findingId,
            operation.targetId,
            input.review,
          ),
        );
      case "assess":
        return Response.json(
          workflow.assess(
            input.review.id,
            operation.findingId,
            operation.outcome,
            operation.explanation,
            operation.checkIds,
            input.review,
          ),
        );
    }
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /contents changed/.test((error as Error).message) ? 409 : 400 },
    );
  }
};
