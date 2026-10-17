"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type WorkspaceRevisions = {
  workspace: string;
  settings: string;
  providers: string;
};

export const useWorkspaceUpdates = () => {
  const client = useQueryClient();
  const previous = useRef<WorkspaceRevisions | null>(null);
  const updates = useQuery({
    queryKey: ["workspace-updates"],
    queryFn: async ({ signal }): Promise<WorkspaceRevisions> => {
      const response = await fetch("/api/workspace/updates", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Workspace updates are unavailable.");
      return response.json();
    },
    refetchInterval: 1000,
    retry: false,
    networkMode: "always",
  });
  useEffect(() => {
    const next = updates.data;
    if (!next) return;
    const last = previous.current;
    previous.current = next;
    if (!last) return;
    const keys: string[] = [];
    if (last.workspace !== next.workspace)
      keys.push("review-history", "agents", "agent-history");
    if (last.settings !== next.settings)
      keys.push("ai-settings", "review-preferences", "ui-preferences");
    if (last.providers !== next.providers) keys.push("provider-settings");
    for (const key of keys) void client.invalidateQueries({ queryKey: [key] });
  }, [updates.data, client]);
};
