import { z } from "zod";
import {
  reviewIdentitySchema,
  languageSettingsSchema,
  sourceSides,
} from "@senslop/contracts";
import { WorkflowStore } from "@senslop/review-core/workflow";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import {
  readExplorerContext,
  readSourceExplorer,
} from "../../../services/analysis/source-explorer";
import { saveLanguageSettings } from "../../../services/analysis/language-settings";

const languageRequestSchema = z.object({
  review: reviewIdentitySchema,
  settings: languageSettingsSchema,
});
export type LanguageRequestSchema = z.infer<typeof languageRequestSchema>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const repository = await workspace.root();
    const params = new URL(request.url).searchParams;
    const review = reviewIdentitySchema.parse({
      id: params.get("reviewId"),
      hash: params.get("hash"),
      round: Number(params.get("round")),
    });
    if (!params.has("path") && !params.has("query"))
      return Response.json(
        await readSourceExplorer(
          workspace.store,
          repository,
          review,
          z.enum(sourceSides).parse(params.get("side") ?? "after"),
        ),
      );
    const context = await readExplorerContext(
      workspace.store,
      repository,
      review,
    );
    const side = z.enum(sourceSides).parse(params.get("side") ?? "after");
    const sources = side === "after" ? context.sources : (context.before ?? {});
    if (params.has("query")) {
      const query = z
        .string()
        .trim()
        .min(1)
        .max(300)
        .parse(params.get("query"))
        .toLowerCase();
      const matches = [];
      for (const [path, source] of Object.entries(sources)) {
        for (const [index, line] of source.split("\n").entries())
          if (line.toLowerCase().includes(query)) {
            matches.push({
              path,
              side,
              start: index + 1,
              end: index + 1,
              code: line.slice(0, 500),
            });
            if (matches.length >= 200) return Response.json(matches);
          }
      }
      return Response.json(matches);
    }
    const path = z.string().min(1).parse(params.get("path"));
    if (!(path in sources))
      return Response.json(
        { message: "Source is unavailable in this frozen revision." },
        { status: 404 },
      );
    return Response.json({
      path,
      side,
      contents: sources[path],
      capability: context.analysis.capabilities?.[path] ?? {
        language: "Other",
        level: "text",
        tool: null,
        limitations: [],
      },
    });
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /changed/.test((error as Error).message) ? 409 : 400 },
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
    const input = languageRequestSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const repository = await workspace.root();
    new WorkflowStore(workspace.store, repository).requireReview(
      input.review.id,
      input.review,
    );
    return Response.json(
      saveLanguageSettings(workspace.store, repository, input.settings),
    );
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
