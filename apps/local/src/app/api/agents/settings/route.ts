import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../../features/workspace/lib/server-workspace";
import { AgentStore } from "../../../../features/agents/lib/agent-store";
import { aiSettingsSchema } from "../../../../features/agents/schemas";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    return Response.json(
      new AgentStore(workspace.store, await workspace.root()).settings(),
    );
  } catch {
    return Response.json(
      { message: "Could not load AI settings." },
      { status: 503 },
    );
  }
};

export const PUT = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const input = aiSettingsSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    return Response.json(
      new AgentStore(workspace.store, await workspace.root()).saveSettings(
        input,
      ),
    );
  } catch {
    return Response.json(
      {
        message:
          "Could not save AI settings. Check the grouping instructions and retry.",
      },
      { status: 400 },
    );
  }
};

export const PATCH = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const updatedSettings = new AgentStore(
      workspace.store,
      await workspace.root(),
    ).patchSettings(await readLocalBody(request));
    return Response.json(updatedSettings);
  } catch {
    return Response.json(
      { message: "Check the AI settings patch and retry." },
      { status: 400 },
    );
  }
};
