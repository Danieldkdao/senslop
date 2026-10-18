import type { LocalStore } from "@senslop/review-core/storage";
import { isSubscriptionProvider } from "@senslop/contracts";
import { ProviderService } from "../../features/providers/lib/provider-service";
import { matchesCatalogModel } from "../../features/providers/lib/normalize-models";
import { osCredentials } from "../credentials/os-credentials";
import { getSubscriptionService } from "../subscriptions/server-subscriptions";
import { AiServiceError } from "./errors";

export const resolveProviderConnection = async (
  local: LocalStore,
  id: string,
  modelId: string,
  signal?: AbortSignal,
) => {
  const resolved = await new ProviderService(local, osCredentials).resolve(id);
  if (!isSubscriptionProvider(resolved.connection.provider)) return resolved;
  try {
    const subscriptions = getSubscriptionService(local);
    const catalog = await subscriptions.models(id, signal);
    if (
      !catalog.models.some(
        (model) => model.available && matchesCatalogModel(model, modelId),
      )
    )
      throw new AiServiceError(
        "This model is not available to the signed-in account. Refresh models and choose an available model.",
      );
    return await subscriptions.resolve(id);
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError(
      "The subscription account or its models are unavailable. Sign in again or retry model discovery.",
      401,
    );
  }
};
