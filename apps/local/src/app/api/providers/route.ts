import { z } from "zod";
import {
  getWorkspace,
  localWorkspaceError,
  protectLocalRoute,
  readLocalBody,
} from "@/features/workspace/lib/server-workspace";
import { ProviderService } from "@/features/providers/lib/provider-service";
import { osCredentials } from "@/services/credentials/os-credentials";

const providerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), connection: z.unknown() }).strict(),
  z.object({ action: z.literal("delete"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("default"), id: z.uuid().nullable() }).strict(),
  z.object({ action: z.literal("test"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("models"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("cleanup") }).strict(),
]);
export type ProviderActionSchema = z.infer<typeof providerActionSchema>;

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    return Response.json(
      await new ProviderService(getWorkspace().store, osCredentials).list(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          "Local provider configuration is unavailable. Check application-data permissions and retry.",
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
  let action: ProviderActionSchema;
  try {
    action = providerActionSchema.parse(await readLocalBody(request));
  } catch {
    return Response.json(
      { message: "Invalid provider request." },
      { status: 400 },
    );
  }
  try {
    const service = new ProviderService(getWorkspace().store, osCredentials);
    switch (action.action) {
      case "save":
        return Response.json(await service.save(action.connection));
      case "delete":
        return Response.json(await service.delete(action.id));
      case "default":
        await service.setDefault(action.id);
        return Response.json(null);
      case "test":
      case "models":
        return Response.json(await service.probe(action.id, action.action));
      case "cleanup":
        return Response.json({ warning: await service.cleanup() });
    }
  } catch (error) {
    const message = (error as Error).message;
    const known =
      /^(The OS credential store|Configuration saved|Connection not found|Connection was edited|The endpoint|This provider|Enter a key|Remove an unused|Provider (server|rejected|metadata|returned)|Saved API key)/.test(
        message,
      );
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          error instanceof z.ZodError
            ? "Check the endpoint, context window, and API key."
            : known
              ? message
              : "Provider settings could not be saved. Check local application-data permissions and retry.",
        ),
      },
      { status: 422 },
    );
  }
};
