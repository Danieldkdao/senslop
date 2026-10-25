"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  organizationSchema,
  type OrganizationActionSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import { toast } from "@/components/ui/toast";

export const useReviewPrecision = (review?: ReviewIdentitySchema | null) => {
  const client = useQueryClient();
  const queryKey = ["precision", review?.id, review?.hash, review?.round];
  const state = useQuery({
    queryKey,
    enabled: !!review,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        reviewId: review!.id,
        hash: review!.hash,
        round: String(review!.round),
      });
      const response = await fetch(`/api/precision?${params}`, {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Review regions unavailable.");
      return organizationSchema.parse(data);
    },
    refetchInterval: 2000,
    retry: false,
    networkMode: "always",
  });
  const mutation = useMutation({
    mutationFn: async (operation: OrganizationActionSchema) => {
      if (!review || !state.data)
        throw new Error("Load review regions before editing.");
      const response = await fetch("/api/precision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review,
          version: state.data.version,
          operation,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Could not update review regions.");
      return organizationSchema.parse(data);
    },
    onSuccess: async (data) => {
      client.setQueryData(queryKey, data);
      await client.invalidateQueries({ queryKey: ["preview"] });
    },
    onError: (error) => {
      toast.error(error.message);
      void client.invalidateQueries({ queryKey });
    },
    retry: false,
    networkMode: "always",
  });
  return { state, act: mutation.mutateAsync, pending: mutation.isPending };
};
