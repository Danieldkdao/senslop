"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import {
  reviewProfiles,
  reviewRulesSchema,
  type ReviewIdentitySchema,
} from "@senslop/contracts";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReviewIntent } from "../hooks/use-review-intent";
import { EffectiveReviewRules } from "./effective-review-rules";
import { formatReviewProfile } from "../lib/formatters";

type ReviewRulesFormSchema = z.infer<typeof reviewRulesSchema>;

export const RulesProfiles = ({
  review,
}: {
  review?: ReviewIdentitySchema | null;
}) => {
  const intent = useReviewIntent(review);
  const [scope, setScope] = useState<"project" | "review">("project");
  const overrides =
    scope === "project"
      ? intent.state.data?.projectOverrides
      : intent.state.data?.reviewOverrides;
  const defaults =
    scope === "project"
      ? intent.state.data?.projectDefaults
      : intent.state.data?.reviewDefaults;
  const formValues = reviewRulesSchema.parse({
    ...overrides,
    profiles: overrides?.profiles ?? defaults ?? ["correctness"],
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof reviewRulesSchema>,
    unknown,
    ReviewRulesFormSchema
  >({
    resolver: zodResolver(reviewRulesSchema),
    values: formValues,
    resetOptions: { keepDirtyValues: true },
  });
  const lastScope = useRef(scope);
  useEffect(() => {
    if (lastScope.current !== scope) {
      lastScope.current = scope;
      reset(
        reviewRulesSchema.parse({
          ...overrides,
          profiles: overrides?.profiles ?? defaults ?? ["correctness"],
        }),
      );
    }
  }, [scope, overrides, defaults, reset]);
  const rules = useFieldArray({ control, name: "rules", keyName: "fieldId" });
  const customProfiles = useFieldArray({
    control,
    name: "customProfiles",
    keyName: "fieldId",
  });
  if (!review)
    return (
      <p className="text-base text-muted-foreground">
        Open a saved review to inspect its captured repository rules and project
        defaults.
      </p>
    );
  return (
    <div className="flex flex-col gap-4 text-base">
      <p className="text-muted-foreground">
        Repository configuration, nested configuration, local project overrides,
        then one-review overrides. Saved runs retain their effective
        instructions.
      </p>
      {intent.state.error && <p role="alert">{intent.state.error.message}</p>}
      <Select
        value={scope}
        onValueChange={(value) => {
          if (value === "project" || value === "review") setScope(value);
        }}
      >
        <SelectTrigger aria-label="Rules scope" className="w-full text-base">
          <SelectValue>
            {scope === "project"
              ? "Local project overrides"
              : "This review only"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="project">Local project overrides</SelectItem>
          <SelectItem value="review">This review only</SelectItem>
        </SelectContent>
      </Select>
      <form
        key={scope}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={handleSubmit(async (values) => {
          try {
            await intent.act({ action: "save-rules", scope, rules: values });
            reset(values);
          } catch {}
        })}
      >
        <fieldset
          disabled={intent.state.isPending}
          className="flex flex-col gap-3"
        >
          <legend className="pb-2 font-medium">Review dimensions</legend>
          <Controller
            control={control}
            name="profiles"
            render={({ field }) => (
              <div className="flex flex-col gap-3">
                {reviewProfiles.map((profile) => {
                  const display = formatReviewProfile(profile);
                  return (
                    <label key={profile} className="flex items-center gap-3">
                      <Checkbox
                        checked={field.value?.includes(profile) ?? false}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked
                              ? [...(field.value ?? []), profile]
                              : field.value?.filter((item) => item !== profile),
                          )
                        }
                      />
                      <display.Icon className="size-4 text-muted-foreground" />
                      {display.label}
                    </label>
                  );
                })}
              </div>
            )}
          />
        </fieldset>
        <div className="flex items-center gap-2">
          <span className="flex-1 font-medium">Rule overrides</span>
          <TooltipWrapper content="Add rule">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add rule"
              onClick={() =>
                rules.append({
                  id: crypto.randomUUID(),
                  text: "",
                  paths: ["**/*"],
                  enabled: true,
                })
              }
            >
              <Plus />
            </Button>
          </TooltipWrapper>
        </div>
        {rules.fields.map((rule, index) => (
          <div
            key={rule.fieldId}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <label className="flex flex-1 flex-col gap-1">
                Rule ID
                <Input
                  {...register(`rules.${index}.id`)}
                  className="w-full font-mono text-base"
                />
              </label>
              <TooltipWrapper content="Remove override">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove rule override"
                  onClick={() => rules.remove(index)}
                >
                  <Trash2 />
                </Button>
              </TooltipWrapper>
            </div>
            <label className="flex flex-col gap-1">
              Instruction
              <Textarea
                {...register(`rules.${index}.text`)}
                className="w-full text-base"
                aria-invalid={!!errors.rules?.[index]?.text}
              />
            </label>
            {errors.rules?.[index]?.text && (
              <p role="alert">{errors.rules[index]?.text?.message}</p>
            )}
            <label className="flex flex-col gap-1">
              Path pattern
              <Input
                {...register(`rules.${index}.paths.0`)}
                className="w-full font-mono text-base"
              />
            </label>
            <Controller
              control={control}
              name={`rules.${index}.enabled`}
              render={({ field }) => (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                  Enabled
                </label>
              )}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="flex-1 font-medium">Custom profiles</span>
          <TooltipWrapper content="Add custom profile">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add custom profile"
              onClick={() =>
                customProfiles.append({
                  id: crypto.randomUUID(),
                  title: "",
                  profiles: ["correctness"],
                  instructions: "",
                })
              }
            >
              <Plus />
            </Button>
          </TooltipWrapper>
        </div>
        {customProfiles.fields.map((profile, index) => (
          <div
            key={profile.fieldId}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <label className="flex flex-1 flex-col gap-1">
                Name
                <Input
                  {...register(`customProfiles.${index}.title`)}
                  className="w-full text-base"
                />
              </label>
              <TooltipWrapper content="Remove custom profile">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove custom profile"
                  onClick={() => customProfiles.remove(index)}
                >
                  <Trash2 />
                </Button>
              </TooltipWrapper>
            </div>
            <label className="flex flex-col gap-1">
              Additional review instructions
              <Textarea
                {...register(`customProfiles.${index}.instructions`)}
                className="w-full text-base"
              />
            </label>
            <Controller
              control={control}
              name={`customProfiles.${index}.profiles`}
              render={({ field }) => (
                <fieldset className="flex flex-col gap-2">
                  <legend>Included dimensions</legend>
                  {reviewProfiles.map((dimension) => {
                    const display = formatReviewProfile(dimension);
                    return (
                      <label
                        key={dimension}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          checked={field.value?.includes(dimension) ?? false}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...(field.value ?? []), dimension]
                                : field.value?.filter(
                                    (value) => value !== dimension,
                                  ),
                            )
                          }
                        />
                        <display.Icon className="size-4" />
                        {display.label}
                      </label>
                    );
                  })}
                </fieldset>
              )}
            />
            {errors.customProfiles?.[index] && (
              <p role="alert">Enter a profile name and valid instructions.</p>
            )}
            <Controller
              control={control}
              name="selectedCustomProfiles"
              render={({ field }) => (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={field.value?.includes(profile.id) ?? false}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...(field.value ?? []), profile.id]
                          : field.value?.filter((id) => id !== profile.id),
                      )
                    }
                  />
                  Use this custom profile
                </label>
              )}
            />
          </div>
        ))}
        <Button type="submit" disabled={intent.state.isPending || isSubmitting}>
          <LoadingSwap isLoading={isSubmitting}>Save overrides</LoadingSwap>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={intent.pending}
          onClick={async () => {
            try {
              await intent.act({ action: "save-rules", scope, rules: {} });
              const refreshed = await intent.state.refetch();
              const profiles =
                scope === "project"
                  ? refreshed.data?.projectDefaults
                  : refreshed.data?.reviewDefaults;
              reset(
                reviewRulesSchema.parse({
                  profiles: profiles ?? ["correctness"],
                }),
              );
            } catch {}
          }}
        >
          Restore inherited settings
        </Button>
      </form>
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer font-medium">
          Effective rules
          <ChevronDown
            aria-hidden="true"
            className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
          <div className="max-h-96 overflow-y-auto overscroll-contain scroll-fade-y pt-3">
            {intent.state.data && (
              <EffectiveReviewRules
                instructions={intent.state.data.instructions}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer font-medium">
          Captured rule sources
          <ChevronDown
            aria-hidden="true"
            className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
          {intent.state.data?.instructions.sources.map((source) => (
            <Collapsible key={source.path} className="pt-3">
              <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer break-all font-mono">
                {source.path}
                <ChevronDown
                  aria-hidden="true"
                  className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap py-2 text-base">
                  {source.contents}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CollapsibleContent>
      </Collapsible>
      {intent.state.data?.instructions.limitations.map((limitation) => (
        <p key={limitation} className="text-muted-foreground">
          {limitation}
        </p>
      ))}
    </div>
  );
};
