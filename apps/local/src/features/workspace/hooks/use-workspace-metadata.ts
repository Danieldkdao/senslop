"use client";

import { useQuery } from "@tanstack/react-query";
import type { WorkspaceMetadata } from "../types";

export const useWorkspaceMetadata = (enabled = true) =>
  useQuery({
    queryKey: ["workspace-metadata"],
    queryFn: async ({ signal }): Promise<WorkspaceMetadata> => {
      const response = await fetch("/api/workspace", {
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.message ?? "Repository unavailable. Refresh and retry.",
        );
      return data;
    },
    enabled,
    refetchInterval: 5000,
    staleTime: 1000,
    retry: false,
    networkMode: "always",
  });
