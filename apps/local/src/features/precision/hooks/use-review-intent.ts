"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { toast } from "@/components/ui/toast";
import {
  reviewIntentStateSchema,
  type ReviewIntentActionSchema,
} from "../schemas";

export const useReviewIntent = (review?: ReviewIdentitySchema | null) => {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["review-intent", review?.id, review?.hash, review?.round],
    enabled: !!review,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/review-intent?reviewId=${review!.id}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Review brief unavailable.");
      return reviewIntentStateSchema.parse(data);
    },
    retry: false,
    networkMode: "always",
    refetchInterval: 5000,
  });
  const mutation = useMutation({
    mutationFn: async (operation: ReviewIntentActionSchema) => {
      if (!review) throw new Error("Open a saved review first.");
      const response = await fetch("/api/review-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review, operation }),
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          (data as { message?: string }).message ??
            "Could not save review intent.",
        );
      return data;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["review-intent", review?.id] }),
    onError: (error) => toast.error(error.message),
    retry: false,
    networkMode: "always",
  });
  return { state, act: mutation.mutateAsync, pending: mutation.isPending };
};
