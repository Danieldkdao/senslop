"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import {
  reviewPreferencesSchema,
  type ReviewPreferencesSchema,
} from "../schemas";

export const useReviewPreferences = () => {
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: ["review-preferences"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/review-preferences", {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Could not load review preferences. Retry.");
      return reviewPreferencesSchema.parse(await response.json());
    },
    staleTime: 60000,
    retry: false,
    networkMode: "always",
  });
  const mutation = useMutation({
    mutationFn: async (input: ReviewPreferencesSchema) => {
      const response = await fetch("/api/review-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok)
        throw new Error("Could not save review preferences. Retry.");
      return reviewPreferencesSchema.parse(await response.json());
    },
    onSuccess: (savedPreferences) =>
      client.setQueryData(["review-preferences"], savedPreferences),
    onError: (error) => toast.error(error.message),
    retry: false,
    networkMode: "always",
  });
  return {
    preferences,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  };
};
