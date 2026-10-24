import type { ProviderConfigSchema } from "@senslop/contracts";
import { AiServiceError } from "../../../services/ai/errors";

export const getCompatibleModel = (
  connection: Pick<ProviderConfigSchema, "provider" | "models">,
  modelId: string,
) => {
  if (connection.provider !== "openai-compatible") return undefined;
  const model = connection.models?.find((model) => model.id === modelId);
  if (!model)
    throw new AiServiceError(
      "This model is not configured for the compatible provider. Choose a saved model or update the provider settings.",
    );
  return model;
};
