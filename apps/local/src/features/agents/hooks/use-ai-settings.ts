"use client";

import { trackSettingsSave } from "../../settings/lib/settings-save-store";
import { useMemo } from "react";
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { aiSettingsSchema, type AiSettingsPatchSchema } from "../schemas";
import { mergeAiSettings } from "../lib/ai-settings";

export const useAiSettings = ({
  watchCapacity = false,
}: { watchCapacity?: boolean } = {}) => {
  const client = useQueryClient();
  const capacityStatus = useQuery({
    queryKey: ["ai-capacity-status"],
    enabled: watchCapacity,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/agents/settings?capacityStatus=1", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Run status is unavailable.");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("locked" in result) ||
        typeof result.locked !== "boolean"
      )
        throw new Error("Run status is unavailable.");
      return { locked: result.locked };
    },
    refetchInterval: 1000,
    retry: false,
    networkMode: "always",
  });
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/agents/settings", {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("AI settings could not be loaded. Retry.");
      return aiSettingsSchema.parse(await response.json());
    },
    retry: false,
    networkMode: "always",
  });
  const mutation = useMutation({
    mutationKey: ["ai-settings"],
    scope: { id: "ai-settings" },
    onMutate: () => client.cancelQueries({ queryKey: ["ai-settings"] }),
    mutationFn: (patch: AiSettingsPatchSchema) =>
      trackSettingsSave("ai-settings", async () => {
        const response = await fetch("/api/agents/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
          keepalive: true,
        });
        if (!response.ok) {
          const error: unknown = await response.json().catch(() => null);
          throw new Error(
            error &&
              typeof error === "object" &&
              "message" in error &&
              typeof error.message === "string"
              ? error.message
              : "AI settings could not be saved. Retry.",
          );
        }
        return aiSettingsSchema.parse(await response.json());
      }),
    onSuccess: (updatedSettings) =>
      client.setQueryData(["ai-settings"], updatedSettings),
    onError: (error) => {
      toast.error(`${error.message} Your last saved settings were restored.`);
      void client.invalidateQueries({ queryKey: ["ai-capacity-status"] });
    },
    retry: false,
    networkMode: "always",
  });
  const pending = useMutationState<AiSettingsPatchSchema>({
    filters: { mutationKey: ["ai-settings"], status: "pending" },
    select: (update) => update.state.variables as AiSettingsPatchSchema,
  });
  // Overlay pending patches so older responses cannot undo newer choices.
  const data = useMemo(
    () => settings.data && pending.reduce(mergeAiSettings, settings.data),
    [settings.data, pending],
  );
  return {
    settings: { ...settings, data },
    save: mutation.mutate,
    saving: pending.length > 0,
    capacityStatus,
  };
};
