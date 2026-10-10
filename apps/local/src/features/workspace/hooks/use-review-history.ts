"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer/debouncer";
import type { WorkspaceMetadata } from "../types";

export const useReviewHistory = (search: string, open: boolean) => {
  const normalizedSearch = search.trim().slice(0, 200);
  const [query] = useDebouncedValue(normalizedSearch, { wait: 250 });
  const client = useQueryClient();
  const history = useQuery({
    queryKey: ["review-history", query],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/workspace?history=1&search=${encodeURIComponent(query)}`,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw new Error("Local history is unavailable. Retry.");
      const data = (await response.json()) as WorkspaceMetadata;
      return data.history;
    },
    enabled: open,
    // Loopback history remains accessible without internet connectivity.
    networkMode: "always",
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return {
    ...history,
    isDebouncing: normalizedSearch !== query,
    invalidate: () =>
      client.invalidateQueries({ queryKey: ["review-history"] }),
  };
};
