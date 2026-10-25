"use client";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
export const projectStatuses = ["running", "stopped", "missing"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const projectSummarySchema = z.object({
  root: z.string(),
  name: z.string(),
  commonDirectory: z.string().nullable(),
  branch: z.string().nullable().default(null),
  head: z.string().nullable().default(null),
  status: z.enum(projectStatuses),
  current: z.boolean(),
  reviewCount: z.number(),
});
export type ProjectSummarySchema = z.infer<typeof projectSummarySchema>;
export const useProjects = (enabled: boolean) =>
  useQuery<ProjectSummarySchema[]>({
    queryKey: ["projects"],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/projects", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Projects unavailable.");
      return z.array(projectSummarySchema).parse(await response.json());
    },
    refetchInterval: enabled ? 10000 : false,
    retry: false,
    networkMode: "always",
  });
