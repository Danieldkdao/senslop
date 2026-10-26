import { memoryActionSchema } from "@senslop/contracts";
import { ProjectMemory } from "@senslop/review-core/memory";
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
    return Response.json(
      new ProjectMemory(workspace.store, await workspace.root()).list(),
    );
  } catch {
    return Response.json(
      { message: "Project memory unavailable." },
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
    const operation = memoryActionSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const memory = new ProjectMemory(workspace.store, await workspace.root());
    switch (operation.action) {
      case "create":
        return Response.json(
          memory.create({ ...operation.guidance, ...operation }),
        );
      case "update":
        return Response.json(
          memory.update(operation.id, operation.version, operation.guidance),
        );
      case "remove":
        memory.remove(operation.id, operation.version);
        return Response.json({ removed: true });
    }
  } catch (error) {
    return Response.json(
      { message: (error as Error).message },
      { status: /changed/.test((error as Error).message) ? 409 : 400 },
    );
  }
};
