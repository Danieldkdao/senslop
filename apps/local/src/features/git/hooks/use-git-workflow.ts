"use client";

import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  gitStateSchema,
  previewFileSchema,
  gitOperationSchema,
  checkpointPolicySchema,
  checkpointResultSchema,
  type GitActionSchema,
  type CheckpointPolicySchema,
} from "@senslop/contracts";
import { toast } from "@/components/ui/toast";
import { trackSettingsSave } from "../../settings/lib/settings-save-store";

export const useGitWorkflow = (enabled = true) => {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["git-workflow"],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/git", { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Git state unavailable.");
      return gitStateSchema
        .extend({
          directory: z.string(),
          policy: checkpointPolicySchema,
          hook: z.object({
            installed: z.boolean(),
            existing: z.boolean(),
            path: z.string(),
          }),
        })
        .parse(data);
    },
    retry: false,
    refetchInterval: 4000,
    networkMode: "always",
  });
  const mutation = useMutation({
    scope: { id: "git-workflow" },
    mutationFn: async (
      operation:
        | GitActionSchema
        | { action: "save-checkpoint"; policy: CheckpointPolicySchema }
        | { action: "install-hook" | "remove-hook" },
    ) => {
      const execute = async () => {
        const response = await fetch("/api/git", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(operation),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message ?? "Git operation failed.");
        return data;
      };
      return operation.action === "save-checkpoint"
        ? trackSettingsSave("push-checkpoint", execute)
        : execute();
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["git-workflow"] });
      await client.invalidateQueries({ queryKey: ["git-diff"] });
      await client.invalidateQueries({ queryKey: ["outgoing"] });
      await client.invalidateQueries({ queryKey: ["workspace-metadata"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return { state, act: mutation.mutateAsync, pending: mutation.isPending };
};

export const useGitDiff = (
  path: string | null,
  staged: boolean,
  identity?: string,
) =>
  useQuery({
    queryKey: ["git-diff", path, staged, identity],
    enabled: !!path,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/git?${new URLSearchParams({ path: path!, staged: String(staged) })}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Diff unavailable.");
      return z.object({ file: previewFileSchema }).parse(data).file;
    },
    retry: false,
    networkMode: "always",
  });

export const useOutgoingCoverage = (
  remote: string,
  branch: string,
  enabled: boolean,
  identity?: string,
) =>
  useQuery({
    queryKey: ["outgoing", remote, branch, identity],
    enabled: enabled && !!remote && !!branch,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/git?${new URLSearchParams({ remote, branch })}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Outgoing coverage unavailable.");
      return checkpointResultSchema.parse(data);
    },
    refetchInterval: 15000,
    retry: false,
    networkMode: "always",
  });

export const useGitConflict = (path: string | null, identity: string) =>
  useQuery({
    queryKey: ["git-conflict", path, identity],
    enabled: !!path,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/git?${new URLSearchParams({ conflict: path! })}`,
        { signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Conflict unavailable.");
      return z
        .object({
          base: z.string().nullable(),
          local: z.string().nullable(),
          incoming: z.string().nullable(),
        })
        .parse(data);
    },
    retry: false,
    networkMode: "always",
  });

export const useCommitCoverage = (identity: string, enabled: boolean) =>
  useQuery({
    queryKey: ["commit-coverage", identity],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/git?candidate", {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? "Commit coverage unavailable.");
      return z
        .object({
          tree: z.string(),
          total: z.number(),
          coverage: gitOperationSchema.shape.coverage,
        })
        .parse(data);
    },
    retry: false,
    networkMode: "always",
  });
