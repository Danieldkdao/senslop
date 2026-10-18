"use client";

import { useId } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { NumberInput } from "@senslop/ui/components/number-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";
import {
  buddyPreferencesSchema,
  type BuddyPreferencesSchema,
} from "../../settings/schemas";
import { buddyMaxSize, buddyMinSize } from "../constants";
import { BuddySprite } from "./buddy-sprite";

export const BuddySettings = () => {
  const id = useId();
  const ui = useUiPreferences();
  const { control, handleSubmit } = useForm<BuddyPreferencesSchema>({
    resolver: zodResolver(buddyPreferencesSchema),
    values: ui.values.buddy,
  });
  const visible = useController({ control, name: "visible" });
  const animations = useController({ control, name: "animations" });
  const size = useController({ control, name: "size" });
  const submit = handleSubmit((values) =>
    ui.save({
      buddy: {
        visible: values.visible,
        animations: values.animations,
        size: values.size,
      },
    }),
  );
  const disabled =
    ui.preferences.isPending || !!ui.preferences.error || ui.saving;
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-4 border-t pt-4 text-base"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">Pip, your review buddy</p>
        <p className="text-muted-foreground">
          A little company while you think. Drag Pip anywhere, or focus Pip and
          use the arrow keys.
        </p>
      </div>
      <label
        htmlFor={`${id}-visible`}
        className="flex items-center justify-between gap-4"
      >
        Show buddy
        <Switch
          id={`${id}-visible`}
          checked={visible.field.value}
          disabled={disabled}
          onCheckedChange={(value) => {
            visible.field.onChange(value);
            void submit();
          }}
        />
      </label>
      {visible.field.value && (
        <div className="flex flex-col gap-4">
          <div
            role="img"
            aria-label="Pip preview"
            className="flex min-h-40 items-center justify-center rounded-lg border bg-muted/30 p-4"
          >
            <BuddySprite mood="idle" still size={size.field.value} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor={`${id}-size`}>Buddy size</label>
            <NumberInput
              id={`${id}-size`}
              label="Buddy size"
              value={size.field.value}
              min={buddyMinSize}
              max={buddyMaxSize}
              unit="px"
              disabled={disabled}
              onValueChange={(value) => {
                size.field.onChange(value);
                void submit();
              }}
            />
          </div>
          {size.fieldState.error && (
            <p role="alert" className="text-destructive">
              {size.fieldState.error.message}
            </p>
          )}
        </div>
      )}
      <label
        htmlFor={`${id}-animations`}
        className="flex items-center justify-between gap-4"
      >
        Animate buddy
        <Switch
          id={`${id}-animations`}
          checked={animations.field.value}
          disabled={disabled}
          onCheckedChange={(value) => {
            animations.field.onChange(value);
            void submit();
          }}
        />
      </label>
      <p className="text-muted-foreground">
        Reduced-motion preferences are always respected. Pausing keeps
        Pip&apos;s expressions and removes movement and confetti.
      </p>
      <Button
        type="button"
        variant="outline"
        className="self-start text-base"
        disabled={disabled}
        onClick={() => ui.save({ buddy: { position: null } })}
      >
        <LoadingSwap isLoading={ui.saving}>Reset buddy position</LoadingSwap>
      </Button>
      {ui.preferences.error && (
        <p role="alert" className="text-destructive">
          {ui.preferences.error.message}
        </p>
      )}
    </form>
  );
};
