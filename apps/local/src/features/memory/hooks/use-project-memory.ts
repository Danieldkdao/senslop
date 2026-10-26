"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  projectMemorySchema,
  type MemoryActionSchema,
} from "@senslop/contracts";
import { toast } from "@/components/ui/toast";
import { trackSettingsSave } from "../../settings/lib/settings-save-store";

export const useProjectMemory = () => {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["project-memory"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/project-memory", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Project memory unavailable.");
      return z.array(projectMemorySchema).parse(await response.json());
    },
    retry: false,
    networkMode: "always",
  });
  const mutation = useMutation({
    scope: { id: "project-memory" },
    mutationFn: (operation: MemoryActionSchema) =>
      trackSettingsSave("project-memory", async () => {
        const response = await fetch("/api/project-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(operation),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message ?? "Could not save project memory.");
        return data;
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["project-memory"] });
      await client.invalidateQueries({ queryKey: ["review-intent"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return { state, act: mutation.mutateAsync, pending: mutation.isPending };
};
