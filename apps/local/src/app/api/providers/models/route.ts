import { z } from "zod";
import { isSubscriptionProvider } from "@senslop/contracts";
import { getSubscriptionService } from "../../../../services/subscriptions/server-subscriptions";
import {
  getWorkspace,
  protectLocalRoute,
} from "../../../../features/workspace/lib/server-workspace";
import { ProviderService } from "../../../../features/providers/lib/provider-service";
import { discoverModels } from "../../../../features/providers/lib/model-catalog";
import { osCredentials } from "../../../../services/credentials/os-credentials";
import { AiServiceError, formatAiError } from "../../../../services/ai/errors";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const id = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("connectionId"));
  if (!id.success)
    return Response.json(
      { message: "Choose a saved connection." },
      { status: 400 },
    );
  try {
    const service = new ProviderService(getWorkspace().store, osCredentials);
    const { connection, secret } = await service.resolve(id.data);
    return Response.json(
      isSubscriptionProvider(connection.provider)
        ? await getSubscriptionService().models(id.data, request.signal)
        : await discoverModels(connection, secret, request.signal),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof AiServiceError
            ? formatAiError(error)
            : "Connection or saved credential is unavailable. Open Configure, unlock the OS credential store, and retry.",
      },
      { status: error instanceof AiServiceError ? error.status : 422 },
    );
  }
};
