"use client";

import { useState } from "react";
import { providerIds } from "@senslop/contracts";
import type { ModelSelection } from "../../providers/model-schemas";
import { useProviderModels } from "../../providers/hooks/use-provider-models";
import { normalizeModels } from "../../providers/lib/normalize-models";
import { useAiSettings } from "./use-ai-settings";

export const useDefaultChatModel = () => {
  const { settings } = useAiSettings();
  const { entries } = useProviderModels();
  const [selected, setSelected] = useState<ModelSelection | null>(null);
  const configured = settings.data
    ? settings.data.separate
      ? settings.data.roles.review
      : settings.data.shared
    : null;
  if (!configured && !selected && settings.data) {
    const entry = providerIds
      .flatMap((provider) =>
        entries.filter((entry) => entry.connection.provider === provider),
      )
      .find(
        (entry) =>
          !entry.error &&
          entry.catalog?.models.some((model) => model.available),
      );
    const model = entry
      ? normalizeModels(entry.catalog!.models).find((model) => model.available)
      : undefined;
    const fallback =
      entry && model
        ? {
            connectionId: entry.connection.id,
            modelId: model.id,
            name: model.name,
          }
        : null;
    // Retain the first usable default when slower provider catalogs arrive later.
    if (fallback) setSelected(fallback);
  }
  return configured ?? selected;
};
