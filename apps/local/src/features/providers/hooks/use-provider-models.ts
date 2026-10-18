"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { modelCatalogSchema } from "../model-schemas";
import { formatProvider } from "../lib/formatters";
import { readProviderSettings } from "../lib/requests";

export const useProviderModels = () => {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["provider-settings"],
    queryFn: async ({ signal }) => {
      const data = await readProviderSettings(signal);
      if (!data)
        throw new Error(
          "Provider settings are unavailable. Retry or open Configure.",
        );
      return data;
    },
    staleTime: 30000,
    retry: false,
    networkMode: "always",
  });
  const connections = (settings.data?.connections ?? []).filter(
    (connection) =>
      !connection.credentialError &&
      (!formatProvider(connection.provider).keyRequired ||
        connection.configured),
  );
  const catalogs = useQueries({
    queries: connections.map((connection) => ({
      queryKey: [
        "provider-models",
        connection.id,
        connection.baseURL,
        connection.configured,
        connection.revision,
        connection.account?.subject,
      ],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await fetch(
          `/api/providers/models?connectionId=${encodeURIComponent(connection.id)}`,
          { signal, cache: "no-store" },
        );
        const data: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            data &&
              typeof data === "object" &&
              "message" in data &&
              typeof data.message === "string"
              ? data.message
              : "Models are unavailable. Retry or open Configure.",
          );
        return modelCatalogSchema.parse(data);
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: false,
      networkMode: "always" as const,
    })),
  });
  const refresh = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: ["provider-models"] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["provider-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["provider-models"] }),
    ]);
  }, [queryClient]);
  return {
    settings,
    entries: connections.map((connection, index) => ({
      connection,
      catalog: catalogs[index].data,
      error: catalogs[index].error,
      pending: catalogs[index].isPending,
      fetching: catalogs[index].isFetching,
      refetch: catalogs[index].refetch,
    })),
    refresh,
  };
};
