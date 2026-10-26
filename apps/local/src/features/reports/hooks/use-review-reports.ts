"use client";

import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewReportSchema, previewFileSchema } from "@senslop/contracts";
import { toast } from "@/components/ui/toast";

export const useReviewReports = (
  reviewId: string,
  enabled: boolean,
  reportId: string | null,
) => {
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["reports", reviewId],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/reports?reviewId=${reviewId}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Report history unavailable.");
      return z
        .object({
          rounds: z.array(z.number()),
          reports: z.array(
            reviewReportSchema.pick({
              id: true,
              title: true,
              review: true,
              createdAt: true,
              includeSource: true,
            }),
          ),
        })
        .parse(await response.json());
    },
    retry: false,
    networkMode: "always",
  });
  const report = useQuery({
    queryKey: ["report", reviewId, reportId],
    enabled: enabled && !!reportId,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/reports?id=${reportId}&source=true`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Report unavailable.");
      const report = reviewReportSchema.parse(await response.json());
      if (report.review.id !== reviewId)
        throw new Error("Report belongs to a different review.");
      return report;
    },
    retry: false,
    networkMode: "always",
  });
  const generate = useMutation({
    mutationFn: async ({
      round,
      includeSource,
    }: {
      round: number;
      includeSource: boolean;
    }) => {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, round, includeSource }),
      });
      if (!response.ok) throw new Error("Report generation failed.");
      return reviewReportSchema.parse(await response.json());
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reports", reviewId] });
    },
    onError: (error) => toast.error(error.message),
  });
  return { history, report, generate };
};

export const useReportEvidence = (
  reportId: string,
  path: string,
  round?: number,
) =>
  useQuery({
    queryKey: ["report-evidence", reportId, path, round],
    enabled: !!reportId && !!path,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/reports?${new URLSearchParams({ id: reportId, path, ...(round ? { round: String(round) } : {}) })}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Captured evidence unavailable.");
      return previewFileSchema.parse(data);
    },
    retry: false,
    networkMode: "always",
  });
