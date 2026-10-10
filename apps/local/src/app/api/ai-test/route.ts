import { chatRequestSchema } from "../../../features/ai-test/schemas";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";
import { ProviderService } from "../../../features/providers/lib/provider-service";
import { osCredentials } from "../../../services/credentials/os-credentials";
import { AiServiceError, formatAiError } from "../../../services/ai/errors";
import { generateReply } from "../../../services/ai/generate-reply";

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const body = await readLocalBody(request).catch(() => null);
  const input = chatRequestSchema.safeParse(body);
  if (!input.success)
    return Response.json(
      {
        message:
          "Invalid chat request. Choose a model and send a bounded text conversation.",
      },
      { status: 400 },
    );
  let resolved: Awaited<ReturnType<ProviderService["resolve"]>>;
  try {
    resolved = await new ProviderService(
      getWorkspace().store,
      osCredentials,
    ).resolve(input.data.connectionId);
  } catch {
    return Response.json(
      {
        message:
          "Connection or saved credential is unavailable. Open Configure, unlock the OS credential store, and retry.",
      },
      { status: 422 },
    );
  }
  try {
    const reply = await generateReply(
      resolved.connection,
      resolved.secret,
      input.data.modelId,
      input.data.messages,
      request.signal,
    );
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { message: formatAiError(error) },
      { status: error instanceof AiServiceError ? error.status : 502 },
    );
  }
};
