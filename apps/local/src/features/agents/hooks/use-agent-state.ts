"use client";

import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer/debouncer";
import { toast } from "@/components/ui/toast";
import {
  agentHistorySchema,
  type HistoryKind,
  agentStateSchema,
  conversationSchema,
  type AgentActionSchema,
} from "../schemas";

export const useAgentState = (snapshotId?: string) => {
  const client = useQueryClient();
  const [requestedJobs, setRequestedJobs] = useState<string[]>([]);
  const state = useQuery({
    queryKey: ["agents", snapshotId],
    enabled: !!snapshotId,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/agents?snapshotId=${snapshotId}`, {
        signal,
        cache: "no-store",
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          (data as { message?: string }).message ??
            "AI history could not be loaded.",
        );
      return agentStateSchema.parse(data);
    },
    refetchInterval: 2000,
    retry: false,
    networkMode: "always",
  });
  const act = async (action: AgentActionSchema) => {
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Action failed.");
      if (action.action === "job" && typeof data.id === "string")
        setRequestedJobs((current) => [...current.slice(-99), data.id]);
      await client.invalidateQueries({ queryKey: ["agents", snapshotId] });
      await client.invalidateQueries({ queryKey: ["conversation"] });
      await client.invalidateQueries({ queryKey: ["agent-history"] });
      return data as unknown;
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };
  return { state, act, requestedJobs };
};

export const useConversation = (id: string | null) => {
  const client = useQueryClient();
  const conversation = useQuery({
    queryKey: ["conversation", id],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/agents?conversationId=${id}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Conversation is unavailable. Retry or choose another conversation.",
        );
      return conversationSchema.parse(await response.json());
    },
    retry: false,
    networkMode: "always",
    refetchInterval: (query) =>
      query.state.data?.messages.at(-1)?.status === "streaming" ? 1000 : false,
  });
  const refresh = async (conversationId = id) => {
    await client.invalidateQueries({
      queryKey: ["conversation", conversationId],
    });
    await client.invalidateQueries({ queryKey: ["agents"] });
  };
  return { conversation, refresh };
};

export const useAgentHistory = (
  snapshotId: string | undefined,
  kind: HistoryKind,
  enabled: boolean,
  search: string,
) => {
  const [normalized] = useDebouncedValue(search.trim().slice(0, 200), {
    wait: 250,
  });
  return useInfiniteQuery({
    queryKey: ["agent-history", snapshotId, kind, normalized],
    enabled: !!snapshotId && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const parameters = new URLSearchParams({
        snapshotId: snapshotId!,
        history: kind,
        offset: String(pageParam),
        search: normalized,
      });
      const response = await fetch(`/api/agents?${parameters}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("History could not be loaded. Retry.");
      return agentHistorySchema.parse(await response.json());
    },
    getNextPageParam: (page) => page.next,
    retry: false,
    networkMode: "always",
  });
};
