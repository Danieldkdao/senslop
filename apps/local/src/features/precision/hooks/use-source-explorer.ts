"use client";

import { toast } from "@/components/ui/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  languageCapabilitySchema,
  languageSettingsSchema,
  type LanguageSettingsSchema,
  type ReviewIdentitySchema,
  type SourceSide,
} from "@senslop/contracts";
import {
  sourceExplorerSchema,
  sourceSearchResultsSchema,
  type SourceLocationSchema,
} from "../schemas";

const frozenSourceSchema = z.object({
  path: z.string(),
  side: z.string(),
  contents: z.string(),
  capability: languageCapabilitySchema,
});
export type FrozenSourceSchema = z.infer<typeof frozenSourceSchema>;

export const useSourceExplorer = (
  review?: ReviewIdentitySchema | null,
  side: SourceSide = "after",
) =>
  useQuery({
    queryKey: [
      "source-explorer",
      review?.id,
      review?.hash,
      review?.round,
      side,
    ],
    enabled: !!review,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        reviewId: review!.id,
        hash: review!.hash,
        round: String(review!.round),
        side,
      });
      const response = await fetch(`/api/source-explorer?${params}`, {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Frozen navigation unavailable.");
      return sourceExplorerSchema.parse(data);
    },
    staleTime: 30000,
    retry: false,
    networkMode: "always",
  });

export const useFrozenSource = (
  review: ReviewIdentitySchema | null | undefined,
  location: SourceLocationSchema | null,
) =>
  useQuery({
    queryKey: [
      "frozen-source",
      review?.id,
      review?.hash,
      review?.round,
      location?.path,
      location?.side,
    ],
    enabled: !!review && !!location,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        reviewId: review!.id,
        hash: review!.hash,
        round: String(review!.round),
        path: location!.path,
        side: location!.side,
      });
      const response = await fetch(`/api/source-explorer?${params}`, {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Frozen source unavailable.");
      return frozenSourceSchema.parse(data);
    },
    staleTime: Infinity,
    retry: false,
    networkMode: "always",
  });

export const useSourceSearch = (
  review: ReviewIdentitySchema | null | undefined,
  query: string,
  enabled: boolean,
  side: "before" | "after",
) =>
  useQuery({
    queryKey: [
      "source-search",
      review?.id,
      review?.hash,
      review?.round,
      query.trim(),
      side,
    ],
    enabled: !!review && enabled && !!query.trim(),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        reviewId: review!.id,
        hash: review!.hash,
        round: String(review!.round),
        query: query.trim(),
        side,
      });
      const response = await fetch(`/api/source-explorer?${params}`, {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Source search unavailable.");
      return sourceSearchResultsSchema.parse(data);
    },
    staleTime: 30000,
    retry: false,
    networkMode: "always",
  });

export const useLanguageSettings = (review?: ReviewIdentitySchema | null) => {
  const client = useQueryClient();
  return useMutation({
    scope: { id: "language-settings" },
    mutationFn: async (settings: LanguageSettingsSchema) => {
      if (!review) throw new Error("Open a review first.");
      const response = await fetch("/api/source-explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review, settings }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Could not save language settings.");
      return languageSettingsSchema.parse(data);
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["source-explorer"] }),
    onError: (error) => toast.error(error.message),
    retry: false,
    networkMode: "always",
  });
};
