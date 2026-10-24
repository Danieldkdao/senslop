"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { aiSettingsSchema, type AiSettingsSchema } from "../schemas";

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
  const save = async (input: AiSettingsSchema) => {
    const response = await fetch("/api/agents/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      toast.error(
        error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
          ? error.message
          : "AI settings could not be saved. Retry.",
      );
      await client.invalidateQueries({ queryKey: ["ai-capacity-status"] });
      throw new Error("Save failed.");
    }
    client.setQueryData(
      ["ai-settings"],
      aiSettingsSchema.parse(await response.json()),
    );
    toast.success("AI settings saved");
  };
  return { settings, save, capacityStatus };
};
