"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { trackSettingsSave } from "../../settings/lib/settings-save-store";
import { toast } from "@/components/ui/toast";
import { workflowStateSchema, type WorkflowActionSchema } from "../schemas";

export const useReviewWorkflow = (review?: ReviewIdentitySchema | null) => {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["workflow", review?.id, review?.hash, review?.round],
    enabled: !!review,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/workflow?reviewId=${review!.id}`, {
        signal,
        cache: "no-store",
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          (data as { message?: string }).message ??
            "Review workflow unavailable.",
        );
      return workflowStateSchema.parse(data);
    },
    refetchInterval: 2000,
    retry: false,
    networkMode: "always",
  });
  const act = async (operation: WorkflowActionSchema, target = review) => {
    if (!target) return null;
    const execute = async () => {
      if (operation.action === "apply-task")
        toast.info("Applying selected files…");
      try {
        const response = await fetch("/api/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review: target, operation }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message ?? "Workflow action failed.");
        await Promise.all([
          client.invalidateQueries({ queryKey: ["workflow", target.id] }),
          client.invalidateQueries({ queryKey: ["project-settings"] }),
          client.invalidateQueries({ queryKey: ["preview"] }),
          client.invalidateQueries({ queryKey: ["workspace-metadata"] }),
        ]);
        if (data.warning) toast.warning(String(data.warning));
        else if (operation.action === "apply-task")
          toast.success("Selected files applied.");
        else if (operation.action === "review-task")
          toast.success("Task marked reviewed.");
        return data as unknown;
      } catch (error) {
        toast.error((error as Error).message);
        throw error;
      }
    };
    return operation.action === "save-review-limits"
      ? trackSettingsSave(`review-limits-${target.id}`, execute)
      : execute();
  };
  return { state, act };
};
