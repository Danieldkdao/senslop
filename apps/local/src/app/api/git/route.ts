import { z } from "zod";
import { gitActionSchema, checkpointPolicySchema } from "@senslop/contracts";
import { GitOperations } from "@senslop/review-core/git-workflow";
import { PushCheckpoint } from "@senslop/review-core/checkpoint";
import {
  checkpointHookStatus,
  installCheckpointHook,
  removeCheckpointHook,
} from "@senslop/review-core/checkpoint-hook";
import { serverEnv } from "../../../data/env/server";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

const gitRequestSchema = z.union([
  gitActionSchema,
  z.object({
    action: z.literal("save-checkpoint"),
    policy: checkpointPolicySchema,
  }),
  z.object({ action: z.literal("install-hook") }),
  z.object({ action: z.literal("remove-hook") }),
]);
export type GitRequestSchema = z.infer<typeof gitRequestSchema>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const service = new GitOperations(workspace.store, root);
    const query = new URL(request.url).searchParams;
    if (query.has("candidate")) return Response.json(await service.candidate());
    if (query.has("conflict"))
      return Response.json(await service.conflict(query.get("conflict")!));
    if (query.has("path")) {
      const file = await service.preview(
        query.get("path")!,
        query.get("staged") === "true",
      );
      return Response.json({ file, diff: file.diff });
    }
    if (query.has("remote"))
      return Response.json(
        await new PushCheckpoint(workspace.store, root).outgoing(
          query.get("remote")!,
          query.get("branch") ?? "",
        ),
      );
    return Response.json({
      ...(await service.status()),
      directory: root,
      policy: new PushCheckpoint(workspace.store, root).policy(),
      hook: await checkpointHookStatus(root),
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
    const operation = gitRequestSchema.parse(await readLocalBody(request));
    switch (operation.action) {
      case "save-checkpoint":
        return Response.json(
          new PushCheckpoint(workspace.store, root).savePolicy(
            operation.policy,
          ),
        );
      case "install-hook":
        return Response.json(
          await installCheckpointHook(
            root,
            serverEnv.SENSLOP_CLI_COMMAND
              ? z
                  .array(z.string())
                  .parse(JSON.parse(serverEnv.SENSLOP_CLI_COMMAND))
              : ["senslop"],
            serverEnv.SENSLOP_LOCAL_DATABASE!,
          ),
        );
      case "remove-hook":
        return Response.json(await removeCheckpointHook(root));
      default:
        return Response.json(
          await new GitOperations(workspace.store, root).act(operation),
        );
    }
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /changed|running/.test((error as Error).message) ? 409 : 400 },
    );
  }
};
