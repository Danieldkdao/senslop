"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { reviewContextSchema } from "../schemas";

export const useReviewContext = (
  review: ReviewIdentitySchema,
  enabled: boolean,
  path: string | null,
) =>
  useQuery({
    queryKey: ["review-context", review.id, review.hash, review.round, path],
    enabled,
    queryFn: async ({ signal }) => {
      const parameters = new URLSearchParams({
        reviewId: review.id,
        context: "1",
      });
      if (path) parameters.set("path", path);
      const response = await fetch(`/api/workflow?${parameters}`, { signal });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Captured context unavailable.");
      return reviewContextSchema.parse(data);
    },
    retry: false,
    networkMode: "always",
  });
