import { deleteReviewData } from "@senslop/review-core/maintenance";
import { z } from "zod";
import { AgentStore } from "../../../features/agents/lib/agent-store";
import { jobPriorities } from "../../../features/agents/schemas";
import { SnapshotLimitError } from "@senslop/review-core/git";
import { scheduleGrouping } from "../../../services/inngest/functions";
import {
  reviewChangeSchema,
  reviewStateSchema,
  resyncModes,
} from "@senslop/contracts";
import {
  getWorkspace,
  localWorkspaceError,
  protectLocalRoute,
  readLocalBody,
} from "@/features/workspace/lib/server-workspace";

const workspaceActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("inspect"),
      source: z.unknown(),
      grouping: z.boolean().optional(),
      directory: z.string().min(1).max(4096).optional(),
      activate: z.boolean().optional(),
      priority: z.enum(jobPriorities).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("resync"),
      id: z.uuid(),
      mode: z.enum(resyncModes).optional(),
      grouping: z.boolean().optional(),
      directory: z.string().min(1).max(4096).optional(),
      activate: z.boolean().optional(),
      expectedHash: reviewStateSchema.shape.hash,
      expectedRound: reviewStateSchema.shape.round.unwrap(),
      priority: z.enum(jobPriorities).optional(),
    })
    .strict(),
  z.object({ action: z.literal("open"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("delete"),
      id: z.uuid(),
      expectedHash: reviewStateSchema.shape.hash.optional(),
      expectedRound: reviewStateSchema.shape.round,
    })
    .strict(),
  z
    .object({
      action: z.literal("change"),
      id: z.uuid(),
      change: reviewChangeSchema,
      expectedHash: reviewStateSchema.shape.hash,
      expectedRound: reviewStateSchema.shape.round.unwrap(),
      response: z.literal("state").optional(),
    })
    .strict(),
]);
export type WorkspaceActionSchema = z.infer<typeof workspaceActionSchema>;

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
    const id = params.get("id");
    if (id) {
      if (id !== "current" && !z.uuid().safeParse(id).success)
        return Response.json(
          { message: "Choose a valid review ID." },
          { status: 400 },
        );
      const existingReview =
        id === "current"
          ? await workspace.current()
          : workspace.store.getReview(root, id);
      return existingReview
        ? Response.json(existingReview, {
            headers: { "Cache-Control": "no-store" },
          })
        : Response.json(
            { message: "Saved review not found in this repository." },
            { status: 404 },
          );
    }
    const historyRequested = params.has("history");
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 50);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return Response.json(
        { message: "Use a nonnegative offset and a limit from 1 to 100." },
        { status: 400 },
      );
    const paginated = params.has("limit") || params.has("offset");
    const existingReviews = historyRequested
      ? paginated
        ? workspace.store.listReviews(root, params.get("search") ?? "", {
            offset,
            limit: limit + 1,
          })
        : workspace.store.listReviews(root, params.get("search") ?? "")
      : [];
    const repository = historyRequested
      ? null
      : await workspace.repository().catch(() => null);
    return Response.json(
      {
        repository,
        root,
        directory: workspace.directory(),
        history: (paginated
          ? existingReviews.slice(0, limit)
          : existingReviews
        ).map((review) => ({
          ...review,
          work: new AgentStore(workspace.store, root).reviewWork(review),
        })),
        next:
          paginated && existingReviews.length > limit ? offset + limit : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          "Local history is unavailable. Check application-data directory permissions and retry.",
        ),
      },
      { status: 503 },
    );
  }
};

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  let action: WorkspaceActionSchema;
  try {
    action = workspaceActionSchema.parse(await readLocalBody(request));
  } catch {
    return Response.json(
      {
        message:
          "Invalid workspace request. Check the selection or note and retry.",
      },
      { status: 400 },
    );
  }
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    switch (action.action) {
      case "inspect": {
        const insertedReview = await workspace.inspect(
          action.source,
          action.grouping,
          { directory: action.directory, activate: action.activate },
        );
        await scheduleGrouping(insertedReview.id, action.priority);
        return Response.json({
          ...insertedReview,
          activated:
            workspace.store.currentReview(root)?.id === insertedReview.id,
        });
      }
      case "resync": {
        const updatedReview = await workspace.resync(
          action.id,
          action.mode,
          action.grouping,
          {
            hash: action.expectedHash,
            round: action.expectedRound,
            activate: action.activate,
            directory: action.directory,
          },
        );
        await scheduleGrouping(updatedReview.id, action.priority);
        return Response.json(updatedReview);
      }
      case "open":
        return Response.json(workspace.store.openReview(root, action.id));
      case "change": {
        const updatedReview = workspace.store.changeReview(
          root,
          action.id,
          action.change,
          { hash: action.expectedHash, round: action.expectedRound },
        );
        return Response.json(
          action.response === "state"
            ? reviewStateSchema.parse(updatedReview)
            : updatedReview,
          {
            headers: {
              ETag: `W/"${updatedReview.id}-${updatedReview.revision}"`,
            },
          },
        );
      }
      case "delete":
        await deleteReviewData(
          workspace.store,
          root,
          action.id,
          action.expectedHash && action.expectedRound
            ? { hash: action.expectedHash, round: action.expectedRound }
            : undefined,
        );
        return Response.json(null);
    }
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Check the Git selection and retry."
        : (error as Error).message;
    const safe =
      error instanceof SnapshotLimitError ||
      /Diff generation|Git|snapshot|ancestor|selection|changed|changes|revision|not found|does not belong|line does not match|repository root|Re-sync/.test(
        message,
      );
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          safe
            ? message
            : "Local save failed. Your saved reviews are retained. Check application-data directory permissions and retry.",
        ),
      },
      {
        status: /Review contents changed|changed during|no longer matches/.test(
          message,
        )
          ? 409
          : 422,
      },
    );
  }
};
