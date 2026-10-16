import { z } from "zod";
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
    })
    .strict(),
  z
    .object({
      action: z.literal("resync"),
      id: z.uuid(),
      mode: z.enum(resyncModes).optional(),
      grouping: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("open"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid() }).strict(),
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
    const historyRequested = params.has("history");
    const repository = historyRequested
      ? null
      : await workspace.repository().catch(() => null);
    return Response.json(
      {
        repository,
        root,
        history: historyRequested
          ? workspace.store.listReviews(root, params.get("search") ?? "")
          : [],
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
      case "inspect":
        return Response.json(
          await workspace.inspect(action.source, action.grouping),
        );
      case "resync":
        return Response.json(
          await workspace.resync(action.id, action.mode, action.grouping),
        );
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
        workspace.store.deleteReview(root, action.id);
        return Response.json(null);
    }
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Check the Git selection and retry."
        : (error as Error).message;
    const safe =
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
      { status: 422 },
    );
  }
};
