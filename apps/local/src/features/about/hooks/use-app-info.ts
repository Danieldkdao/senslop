"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { appUpdateSchema } from "@senslop/contracts";

export const useAppInfo = () =>
  useQuery({
    queryKey: ["app-info"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/about", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("App information unavailable.");
      return z
        .object({
          name: z.string(),
          description: z.string(),
          update: appUpdateSchema,
          node: z.string(),
          platform: z.string(),
          architecture: z.string(),
          databaseVersion: z.number(),
          gitVersion: z.string(),
          startedAt: z.string().nullable(),
          pendingJobs: z.number(),
        })
        .parse(await response.json());
    },
    staleTime: 21600000,
    refetchInterval: 21600000,
    retry: false,
    networkMode: "always",
  });
