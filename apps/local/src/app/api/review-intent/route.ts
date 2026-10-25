import { z } from "zod";
import {
  reviewIdentitySchema,
  reviewCriterionSchema,
} from "@senslop/contracts";
import { ReviewIntent } from "@senslop/review-core/review-intent";
import {
  applicableReviewProfiles,
  readReviewInstructions,
  readReviewOverrides,
  saveReviewOverrides,
} from "@senslop/review-core/review-rules";
import { WorkflowStore } from "@senslop/review-core/workflow";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import { reviewIntentActionSchema } from "../../../features/precision/schemas";
import { loadContext } from "../../../services/analysis/frozen-context";
import { AgentStore } from "../../../features/agents/lib/agent-store";
import { assignedModel } from "../../../features/agents/lib/model-selection";
import { createRepositoryAgent } from "../../../services/ai/repository-agent";

const reviewIntentRequestSchema = z.object({
  review: reviewIdentitySchema,
  operation: reviewIntentActionSchema,
});
export type ReviewIntentRequestSchema = z.infer<
  typeof reviewIntentRequestSchema
>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const review = new WorkflowStore(workspace.store, root).requireReview(
      z.uuid().parse(new URL(request.url).searchParams.get("reviewId")),
    );
    const context = await loadContext(workspace.store, root, review);
    return Response.json({
      briefs: new ReviewIntent(workspace.store, root).briefs(review.id),
      instructions: readReviewInstructions(workspace.store, root, review.id),
      projectDefaults: applicableReviewProfiles(
        readReviewInstructions(workspace.store, root, review.id, {
          project: {},
          review: {},
        }),
        "",
      ),
      reviewDefaults: applicableReviewProfiles(
        readReviewInstructions(workspace.store, root, review.id, {
          review: {},
        }),
        "",
      ),
      projectOverrides: readReviewOverrides(workspace.store, root),
      reviewOverrides: readReviewOverrides(workspace.store, root, review.id),
      documents: Object.keys(context.sources)
        .filter((path) => /\.(?:md|txt)$/i.test(path))
        .sort(),
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
    const { review, operation } = reviewIntentRequestSchema.parse(
      await readLocalBody(request),
    );
    const workspace = getWorkspace();
    const root = await workspace.root();
    const snapshot = new WorkflowStore(workspace.store, root).requireReview(
      review.id,
      review,
    );
    if (operation.action === "save-rules")
      return Response.json(
        saveReviewOverrides(
          workspace.store,
          root,
          operation.rules,
          operation.scope === "review" ? review.id : undefined,
        ),
      );
    const context = await loadContext(workspace.store, root, snapshot);
    if (operation.action === "save-brief") {
      const documents = operation.brief.documents.map(({ path }) => {
        if (!/\.(?:md|txt)$/i.test(path) || context.sources[path] === undefined)
          throw new Error("Select an available captured text document.");
        return { path, contents: context.sources[path]! };
      });
      return Response.json(
        new ReviewIntent(workspace.store, root).saveBrief(
          review,
          operation.version,
          { ...operation.brief, documents },
        ),
      );
    }
    const documents = operation.documents.map((path) => {
      if (context.sources[path] === undefined)
        throw new Error("Document is outside captured context.");
      return { path, contents: context.sources[path]! };
    });
    const settings = new AgentStore(workspace.store, root).settings();
    const selection = assignedModel(settings, "review");
    if (!selection)
      throw new Error("Choose a Review model in AI settings first.");
    const agent = await createRepositoryAgent({
      local: workspace.store,
      snapshot,
      context,
      settings,
      selection,
      signal: request.signal,
      task: "requirements",
    });
    const criteria = await agent.suggestCriteria(operation.request, documents);
    return Response.json(z.array(reviewCriterionSchema).parse(criteria));
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /changed/.test((error as Error).message) ? 409 : 400 },
    );
  }
};
