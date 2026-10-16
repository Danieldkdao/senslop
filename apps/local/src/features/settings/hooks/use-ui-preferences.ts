"use client";

import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { uiPreferencesSchema, type UiPreferencesPatchSchema } from "../schemas";
import { defaultUiPreferences } from "../constants";
import { mergeUiPreferences } from "../lib/ui-preferences";

export const useUiPreferences = () => {
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: ["ui-preferences"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/ui-preferences", {
        signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Could not load editor and appearance settings. Retry.",
        );
      return uiPreferencesSchema.parse(await response.json());
    },
    staleTime: 60000,
    retry: false,
    networkMode: "always",
  });
  const mutation = useMutation({
    mutationKey: ["ui-preferences"],
    scope: { id: "ui-preferences" },
    onMutate: () => client.cancelQueries({ queryKey: ["ui-preferences"] }),
    mutationFn: async (patch: UiPreferencesPatchSchema) => {
      const response = await fetch("/api/ui-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
      });
      if (!response.ok)
        throw new Error(
          "Could not save editor and appearance settings. Your last saved settings were restored. Retry.",
        );
      return uiPreferencesSchema.parse(await response.json());
    },
    onSuccess: (updatedPreferences) =>
      client.setQueryData(["ui-preferences"], updatedPreferences),
    onError: (error) => toast.error(error.message),
    retry: false,
    networkMode: "always",
  });
  const pending = useMutationState<UiPreferencesPatchSchema>({
    filters: { mutationKey: ["ui-preferences"], status: "pending" },
    select: (update) => update.state.variables as UiPreferencesPatchSchema,
  });
  // Pending patches sit over confirmed data, so older responses cannot undo newer input.
  const values = pending.reduce(
    mergeUiPreferences,
    preferences.data ?? defaultUiPreferences,
  );
  return {
    preferences,
    values,
    save: mutation.mutate,
    saving: pending.length > 0,
  };
};
