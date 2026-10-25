import { z } from "zod";
import {
  organizationActionSchema,
  reviewIdentitySchema,
} from "@senslop/contracts";
import { PrecisionStore } from "@senslop/review-core/precision";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

const precisionRequestSchema = z.object({
  review: reviewIdentitySchema,
  version: z.number().int().nonnegative(),
  operation: organizationActionSchema,
});
export type PrecisionRequestSchema = z.infer<typeof precisionRequestSchema>;

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
    return Response.json(
      new PrecisionStore(workspace.store, repository).organization(review),
    );
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
    const input = precisionRequestSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    return Response.json(
      new PrecisionStore(
        workspace.store,
        await workspace.root(),
      ).changeOrganization(input.review, input.version, input.operation),
    );
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /changed/.test((error as Error).message) ? 409 : 400 },
    );
  }
};
