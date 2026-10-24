"use client";

import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/field";
import type { CompatibleProviderFormSchema } from "../compatible-provider-schemas";
import { compatibleModelCapabilities } from "../constants";
import {
  formatCompatibleCapability,
  formatCompatibleTokenField,
  formatCompatibleTokenRange,
} from "../lib/formatters";

type CompatibleModelFieldsProps = {
  form: UseFormReturn<CompatibleProviderFormSchema>;
  index: number;
  id: string;
  canRemove: boolean;
  onRemove: () => void;
};

export const CompatibleModelFields = ({
  form,
  index,
  id,
  canRemove,
  onRemove,
}: CompatibleModelFieldsProps) => {
  const errors = form.formState.errors.models?.[index];
  const supportsTools = useWatch({
    control: form.control,
    name: `models.${index}.supportsTools`,
  });
  const chat = useWatch({
    control: form.control,
    name: `models.${index}.supportsChatCompletions`,
  });
  return (
    <fieldset
      aria-label={`Model ${index + 1}`}
      className="flex flex-col gap-5 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Model {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          className="text-base"
          disabled={!canRemove}
          onClick={onRemove}
        >
          Remove model
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`}>Model name</label>
        <p className="text-muted-foreground">
          The exact model name used by the provider API.
        </p>
        <Input
          id={`${id}-name`}
          className="text-base"
          placeholder="e.g. my-model"
          {...form.register(`models.${index}.id`)}
          aria-invalid={!!errors?.id}
          aria-describedby={`${id}-name-error`}
        />
        <FieldError
          id={`${id}-name-error`}
          errors={[errors?.id]}
          className="text-base"
        />
      </div>
      {(
        ["maxCompletionTokens", "maxOutputTokens", "contextWindow"] as const
      ).map((key) => {
        const { label, description, min, max } =
          formatCompatibleTokenField(key);
        const inputId = `${id}-${key}`;
        return (
          <div key={key} className="flex flex-col gap-2">
            <label htmlFor={inputId}>{label}</label>
            <p id={`${inputId}-help`} className="text-muted-foreground">
              {description} {formatCompatibleTokenRange(min, max)}
            </p>
            <Input
              id={inputId}
              type="number"
              min={min}
              max={max}
              step={1}
              className="text-base"
              {...form.register(`models.${index}.${key}`, {
                valueAsNumber: true,
              })}
              aria-invalid={!!errors?.[key]}
              aria-describedby={`${inputId}-help ${inputId}-error`}
            />
            <FieldError
              id={`${inputId}-error`}
              errors={[errors?.[key]]}
              className="text-base"
            />
          </div>
        );
      })}
      {compatibleModelCapabilities.map((key) => {
        const { label, description } = formatCompatibleCapability(key);
        const inputId = `${id}-${key}`;
        return (
          <div key={key} className="flex flex-col gap-2">
            <label htmlFor={inputId} className="flex items-center gap-3">
              <Controller
                control={form.control}
                name={`models.${index}.${key}`}
                render={({ field }) => (
                  <Switch
                    id={inputId}
                    ref={field.ref}
                    checked={field.value}
                    disabled={
                      (key === "supportsParallelToolCalls" && !supportsTools) ||
                      (key === "usesMaxTokens" && !chat)
                    }
                    aria-describedby={`${inputId}-help ${inputId}-error`}
                    aria-invalid={!!errors?.[key]}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      if (key === "supportsTools" && !checked)
                        form.setValue(
                          `models.${index}.supportsParallelToolCalls`,
                          false,
                          { shouldDirty: true },
                        );
                      if (key === "supportsChatCompletions" && !checked)
                        form.setValue(`models.${index}.usesMaxTokens`, false, {
                          shouldDirty: true,
                        });
                    }}
                  />
                )}
              />
              {label}
            </label>
            <p id={`${inputId}-help`} className="text-muted-foreground">
              {description}
            </p>
            <FieldError
              id={`${inputId}-error`}
              errors={[errors?.[key]]}
              className="text-base"
            />
          </div>
        );
      })}
    </fieldset>
  );
};
