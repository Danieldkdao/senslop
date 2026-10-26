import { z } from "zod";
import { ReviewReports, renderReportHtml } from "@senslop/review-core/reports";
import { WorkflowStore } from "@senslop/review-core/workflow";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

const reportRequestSchema = z.object({
  reviewId: z.uuid(),
  round: z.number().int().positive(),
  includeSource: z.boolean().default(false),
});
export type ReportRequestSchema = z.infer<typeof reportRequestSchema>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const reports = new ReviewReports(workspace.store, root);
    const query = new URL(request.url).searchParams;
    if (query.has("id")) {
      if (query.has("path"))
        return Response.json(
          reports.evidence(
            z.uuid().parse(query.get("id")),
            query.get("path")!,
            query.has("round")
              ? z.coerce.number().int().positive().parse(query.get("round"))
              : undefined,
          ),
        );
      const report = reports.export(
        z.uuid().parse(query.get("id")),
        query.get("source") === "true",
      );
      if (!report)
        return Response.json({ message: "Report not found." }, { status: 404 });
      if (query.get("format") === "html")
        return new Response(renderReportHtml(report), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="senslop-report-${report.review.round}.html"`,
          },
        });
      return Response.json(report);
    }
    const id = z.uuid().parse(query.get("reviewId"));
    const workflow = new WorkflowStore(workspace.store, root);
    const current = workflow.requireReview(id);
    return Response.json({
      rounds: [
        ...new Set([
          current.round,
          ...workflow.rounds(id).map((round) => round.round),
        ]),
      ].sort((a, b) => b - a),
      reports: reports
        .list(id)
        .map(({ id, title, review, createdAt, includeSource }) => ({
          id,
          title,
          review,
          createdAt,
          includeSource,
        })),
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
    const input = reportRequestSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    return Response.json(
      new ReviewReports(workspace.store, await workspace.root()).generate(
        input.reviewId,
        input.round,
        input.includeSource,
      ),
    );
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
