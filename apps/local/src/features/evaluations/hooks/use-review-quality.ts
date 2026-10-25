"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { evaluationRunSchema, type EvaluationMode } from "../schemas";

export const useReviewQuality = () => {
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const state = useQuery({
    queryKey: ["review-quality"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/review-quality", {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Quality reports unavailable.");
      return evaluationRunSchema.array().parse(data);
    },
    retry: false,
    networkMode: "always",
  });
  const run = useMutation({
    mutationFn: async (mode: EvaluationMode) => {
      controller.current = new AbortController();
      const response = await fetch("/api/review-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, allowLive: mode === "live" }),
        signal: controller.current.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Quality evaluation failed.");
      return evaluationRunSchema.parse(data);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["review-quality"] }),
    onError: (error) => {
      if (error.name !== "AbortError") toast.error(error.message);
    },
    retry: false,
    networkMode: "always",
  });
  return { state, run, cancel: () => controller.current?.abort() };
};
