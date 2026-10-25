"use client";
import { useQuery } from "@tanstack/react-query";
import { savedReviewSchema } from "@senslop/contracts";

export const useRoundComparison = (
  reviewId: string,
  source: number,
  destination: number,
  mode: "compare" | "history" | null,
) => {
  return useQuery({
    queryKey: ["round-comparison", reviewId, source, destination, mode],
    enabled: !!mode,
    queryFn: async ({ signal }) => {
      const read = async (round: number) => {
        const response = await fetch(
          `/api/workflow?reviewId=${reviewId}&round=${round}`,
          { signal },
        );
        if (!response.ok) throw new Error("Round evidence unavailable.");
        return savedReviewSchema.parse(await response.json());
      };
      return await Promise.all([read(source), read(destination)]);
    },
    retry: false,
    networkMode: "always",
  });
};
