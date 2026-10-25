"use client";
import { useQuery } from "@tanstack/react-query";
import type { FixTaskSchema } from "@senslop/contracts";

export const useFixTaskPrompt = (task: FixTaskSchema, open: boolean) => {
  return useQuery({
    queryKey: ["fix-task-prompt", task.id, task.updatedAt],
    enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/workflow?taskId=${task.id}&prompt=1`, {
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Handoff unavailable.");
      return String(data.prompt);
    },
    retry: false,
    networkMode: "always",
  });
};
