"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  projectPolicySchema,
  usageRecordSchema,
  executionManifestSchema,
  type ProjectPolicySchema,
} from "@senslop/contracts";
import { toast } from "@/components/ui/toast";

const projectSettingsSchema = z.object({
  policy: projectPolicySchema,
  usage: z.array(usageRecordSchema),
  workspaces: z.array(executionManifestSchema).default([]),
});
export type ProjectSettingsSchema = z.infer<typeof projectSettingsSchema>;
export const useProjectSettings = (enabled = true) => {
  const client = useQueryClient();
  const state = useQuery<ProjectSettingsSchema>({
    queryKey: ["project-settings"],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/project", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Project settings unavailable.");
      return projectSettingsSchema.parse(await response.json());
    },
    refetchInterval: 10000,
    retry: false,
    networkMode: "always",
  });
  const save = async (policy: ProjectPolicySchema) => {
    try {
      const response = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Project settings could not be saved.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["project-settings"] }),
        client.invalidateQueries({ queryKey: ["workflow"] }),
      ]);
      return projectPolicySchema.parse(data);
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };
  return { state, save };
};
