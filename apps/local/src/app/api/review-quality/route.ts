import { z } from "zod";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import { evaluationModes } from "../../../features/evaluations/schemas";
import {
  readEvaluationHistory,
  saveEvaluationRun,
} from "../../../features/evaluations/lib/evaluation-history";
import { runReviewEvaluation } from "../../../features/evaluations/lib/run-evaluation";
import { evaluateReviewModel } from "../../../services/ai/evaluate-review";

const evaluationRequestSchema = z.object({
  mode: z.enum(evaluationModes),
  allowLive: z.boolean().default(false),
});
export type EvaluationRequestSchema = z.infer<typeof evaluationRequestSchema>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    return Response.json(
      readEvaluationHistory(workspace.store, await workspace.root()),
    );
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
    const input = evaluationRequestSchema.parse(await readLocalBody(request));
    if (input.mode === "live" && !input.allowLive)
      throw new Error("Explicit opt-in is required for live inference.");
    const workspace = getWorkspace();
    const repository = await workspace.root();
    const run =
      input.mode === "live"
        ? await evaluateReviewModel(workspace.store, repository, request.signal)
        : await runReviewEvaluation({
            mode: "deterministic",
            signal: request.signal,
          });
    saveEvaluationRun(workspace.store, repository, run);
    return Response.json(run);
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: 400 },
    );
  }
};
