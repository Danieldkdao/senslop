"use client";

import { useId } from "react";
import { useForm, useController } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { useReviewPreferences } from "../hooks/use-review-preferences";
import {
  reviewPreferencesSchema,
  type ReviewPreferencesSchema,
} from "../schemas";

export const ReviewPreferences = () => {
  const id = useId();
  const { preferences, save, saving } = useReviewPreferences();
  const { control, handleSubmit, reset } = useForm<
    z.input<typeof reviewPreferencesSchema>,
    unknown,
    ReviewPreferencesSchema
  >({
    resolver: zodResolver(reviewPreferencesSchema),
    defaultValues: { autoAdvance: false },
    values: preferences.data,
  });
  const { field } = useController({ control, name: "autoAdvance" });
  const submit = handleSubmit(async (values) => {
    try {
      await save(values);
    } catch {
      reset(preferences.data ?? { autoAdvance: false });
    }
  });
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-2 text-base"
    >
      <label htmlFor={id} className="flex items-center justify-between gap-4">
        Move to the next file after completing a file
        <Switch
          id={id}
          checked={field.value}
          disabled={preferences.isPending || !!preferences.error || saving}
          onCheckedChange={(checked) => {
            field.onChange(checked);
            void submit();
          }}
        />
      </label>
      <p className="text-muted-foreground">
        Automatically open the next file in review order after saving
        completion. Stay on the last file when you reach the end.
      </p>
      {preferences.error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-destructive">{preferences.error.message}</p>
          <Button
            type="button"
            variant="outline"
            className="self-start text-base"
            disabled={preferences.isFetching}
            onClick={() => void preferences.refetch()}
          >
            <LoadingSwap isLoading={preferences.isFetching}>
              Retry loading preferences
            </LoadingSwap>
          </Button>
        </div>
      )}
    </form>
  );
};
