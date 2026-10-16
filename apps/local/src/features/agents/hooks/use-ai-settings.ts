"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { aiSettingsSchema, type AiSettingsSchema } from "../schemas";

export const useAiSettings = () => {
  const client = useQueryClient();
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
      toast.error("AI settings could not be saved. Retry.");
      throw new Error("Save failed.");
    }
    client.setQueryData(
      ["ai-settings"],
      aiSettingsSchema.parse(await response.json()),
    );
    toast.success("AI settings saved");
  };
  return { settings, save };
};
