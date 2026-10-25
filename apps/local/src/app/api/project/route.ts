import { removeManagedWorkspace } from "@senslop/review-core/execution";
import {
  deleteReviewData,
  projectManifests,
} from "@senslop/review-core/maintenance";
import { projectPolicySchema, usageRecordSchema } from "@senslop/contracts";
import { z } from "zod";
import { listSourcePaths } from "@senslop/review-core/git";
import { WorkflowStore } from "@senslop/review-core/workflow";
import {
  readProjectPolicy,
  saveProjectPolicy,
  allowsSourcePath,
} from "@senslop/review-core/policy";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const parameters = new URL(request.url).searchParams;
    if (
      parameters.get("export") === "metadata" ||
      parameters.get("export") === "source"
    ) {
      const withSource = parameters.get("export") === "source";
      const workflow = new WorkflowStore(workspace.store, root);
      const reviews = workspace.store.listReviews(root);
      return Response.json({
        format: "senslop-project-export",
        version: 1,
        createdAt: new Date().toISOString(),
        reviews: reviews.map((review) => ({
          id: review.id,
          title: review.title,
          hash: review.hash,
          round: review.round,
          findings: workflow.findings(review.id).map((finding) =>
            withSource
              ? finding
              : {
                  id: finding.id,
                  decision: finding.decision,
                  observationCount: finding.observations.length,
                  history: finding.history.map((event) => ({
                    kind: event.kind,
                    label: event.label,
                    review: event.review,
                    createdAt: event.createdAt,
                  })),
                },
          ),
          ...(withSource ? { rounds: workflow.rounds(review.id) } : {}),
        })),
      });
    }
    if (parameters.has("diagnostics"))
      return Response.json({
        format: "senslop-diagnostics",
        version: 1,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        reviewCount: workspace.store.listReviews(root).length,
        createdAt: new Date().toISOString(),
        sourceIncluded: false,
        credentialsIncluded: false,
      });
    const usage = workspace.store.database
      .prepare(
        "SELECT u.body FROM review_usage u JOIN reviews r ON r.id=u.review_id WHERE r.repository=? ORDER BY u.rowid",
      )
      .all(root)
      .map((row) => usageRecordSchema.parse(JSON.parse(String(row.body))));
    return Response.json({
      policy: readProjectPolicy(workspace.store, root),
      usage,
      workspaces: projectManifests(workspace.store, root),
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
    const workspace = getWorkspace();
    const root = await workspace.root();
    const body = await readLocalBody(request);
    if (
      body &&
      typeof body === "object" &&
      "action" in body &&
      body.action === "cleanup-workspace"
    ) {
      const input = z
        .object({
          action: z.literal("cleanup-workspace"),
          id: z.uuid(),
          discard: z.boolean().default(false),
        })
        .parse(body);
      return Response.json(
        await removeManagedWorkspace(
          workspace.store,
          root,
          input.id,
          input.discard,
        ),
      );
    }
    if (
      body &&
      typeof body === "object" &&
      "action" in body &&
      body.action === "preview"
    ) {
      const policy = projectPolicySchema.parse(
        "policy" in body ? body.policy : null,
      );
      const paths = await listSourcePaths(root, null);
      return Response.json({
        included: paths.filter((path) => allowsSourcePath(policy, path)),
        excluded: paths.filter((path) => !allowsSourcePath(policy, path)),
      });
    }
    if (
      body &&
      typeof body === "object" &&
      "action" in body &&
      body.action === "delete-history"
    ) {
      z.object({
        action: z.literal("delete-history"),
        confirm: z.literal(true),
      }).parse(body);
      for (const review of workspace.store.listReviews(root))
        await deleteReviewData(workspace.store, root, review.id);
      return Response.json({ deleted: true });
    }
    return Response.json(
      saveProjectPolicy(
        workspace.store,
        root,
        projectPolicySchema.parse({
          ...readProjectPolicy(workspace.store, root),
          ...z.record(z.string(), z.unknown()).parse(body),
        }),
      ),
    );
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
