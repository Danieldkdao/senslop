"use client";

import {
  clearSettingsSaveStatus,
  setSettingsSaveStatus,
} from "../../settings/lib/settings-save-store";
import { useCallback, useRef } from "react";
import { useDebouncer } from "@tanstack/react-pacer/debouncer";
import type { z } from "zod";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field";
import { ModelPicker } from "../../providers/components/model-picker";
import { useProviderModels } from "../../providers/hooks/use-provider-models";
import { getProviderSettingsSection } from "../../settings/components/provider-settings-dialog";
import type { SettingsNavigation } from "../../settings/types";
import { useAiSettings } from "../hooks/use-ai-settings";
import { assignedModel } from "../lib/model-selection";
import { defaultAiSettings } from "../constants";
import {
  agentRoles,
  groupingModes,
  aiSettingsSchema,
  type AiSettingsSchema,
} from "../schemas";
import { formatAgentRole, formatGroupingMode } from "../lib/formatters";
import { AiCapacitySettings } from "../../ai-capacity/components/ai-capacity-settings";
import { NumberInput } from "@senslop/ui/components/number-input";

export const AiSettings = ({
  navigation,
}: {
  navigation: SettingsNavigation;
}) => {
  const { settings, save, capacityStatus } = useAiSettings({
    watchCapacity: true,
  });
  const { entries } = useProviderModels();
  const available = entries.some(
    (entry) =>
      entry.catalog?.models.some((model) => model.available) ||
      entry.catalog?.manualAllowed,
  );
  const {
    control,
    register,
    resetField,
    trigger,
    formState: { errors },
  } = useForm<z.input<typeof aiSettingsSchema>, unknown, AiSettingsSchema>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: defaultAiSettings,
    values: settings.data,
    resetOptions: { keepDirtyValues: true },
  });
  const promptField = register("prompt");
  const promptDraft = useRef<string | null>(null);
  const savePrompt = useCallback(() => {
    if (promptDraft.current === null) return;
    const parsed = aiSettingsSchema.shape.prompt.safeParse(promptDraft.current);
    if (!parsed.success) {
      setSettingsSaveStatus("ai-prompt-draft", { status: "invalid" });
      void trigger("prompt");
      return;
    }
    promptDraft.current = null;
    clearSettingsSaveStatus("ai-prompt-draft");
    resetField("prompt", { defaultValue: parsed.data });
    save({ prompt: parsed.data });
  }, [resetField, save, trigger]);
  const promptDebouncer = useDebouncer(savePrompt, {
    wait: 500,
    onUnmount: (debouncer) => {
      debouncer.flush();
      clearSettingsSaveStatus("ai-prompt-draft");
    },
  });
  const separate = useWatch({ control, name: "separate" });
  const shared = useWatch({ control, name: "shared" });
  const roles = useWatch({ control, name: "roles" });
  const groupingConfigured = !!assignedModel(
    { separate, shared, roles },
    "grouping",
  );
  return (
    <div className="flex flex-col gap-6">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          promptDebouncer.flush();
        }}
        className="flex flex-col gap-5"
      >
        <fieldset
          aria-label="Task models"
          disabled={!available || settings.isPending}
          className="flex flex-col gap-4 disabled:opacity-60"
        >
          <legend className="mb-3 font-medium">Models</legend>
          <label className="flex items-center gap-3">
            <Controller
              control={control}
              name="separate"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(separate) => {
                    resetField("separate", { defaultValue: separate });
                    save({ separate });
                  }}
                  disabled={!available}
                />
              )}
            />
            Use a separate model for each task
          </label>
          {separate ? (
            agentRoles.map((role) => {
              const { label, description } = formatAgentRole(role);
              return (
                <div
                  key={role}
                  role="group"
                  aria-label={label}
                  className="flex flex-col gap-2"
                >
                  <p className="font-medium">{label}</p>
                  <p className="text-muted-foreground">{description}</p>
                  <Controller
                    name={`roles.${role}`}
                    control={control}
                    render={({ field }) => (
                      <ModelPicker
                        value={field.value}
                        onChange={(model) => {
                          resetField(field.name, { defaultValue: model });
                          save({ roles: { [role]: model } });
                        }}
                        disabled={!available}
                        preserveSelection
                      />
                    )}
                  />
                </div>
              );
            })
          ) : (
            <div className="flex flex-col gap-2">
              <p>One model for all tasks</p>
              <p className="text-muted-foreground">
                Uses the same model to group changes, gather context, review
                code, and explain changes.
              </p>
              <Controller
                name="shared"
                control={control}
                render={({ field }) => (
                  <ModelPicker
                    value={field.value}
                    onChange={(shared) => {
                      resetField("shared", { defaultValue: shared });
                      save({ shared });
                    }}
                    disabled={!available}
                    preserveSelection
                  />
                )}
              />
            </div>
          )}
        </fieldset>
        {!available && (
          <p className="text-muted-foreground">
            Configure a provider with an available model to enable AI tasks.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="grouping-mode">Grouping and summaries</label>
          <Controller
            name="groupingMode"
            control={control}
            render={({ field }) => (
              <>
                <Select
                  value={
                    groupingConfigured ? (field.value ?? "never") : "never"
                  }
                  onValueChange={(value) => {
                    const groupingMode = groupingModes.find(
                      (mode) => mode === value,
                    );
                    if (!groupingMode) return;
                    resetField("groupingMode", { defaultValue: groupingMode });
                    save({ groupingMode });
                  }}
                  disabled={settings.isPending || !groupingConfigured}
                >
                  <SelectTrigger
                    id="grouping-mode"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    className="w-full text-base"
                    aria-describedby="grouping-mode-description"
                  >
                    <SelectValue>
                      {
                        formatGroupingMode(
                          groupingConfigured
                            ? (field.value ?? "never")
                            : "never",
                        ).label
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {groupingModes.map((mode) => {
                      const { label, description } = formatGroupingMode(mode);
                      return (
                        <SelectItem
                          key={mode}
                          value={mode}
                          className="text-base"
                        >
                          <span className="flex flex-col gap-1">
                            <span>{label}</span>
                            <span className="text-muted-foreground whitespace-normal">
                              {description}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p
                  id="grouping-mode-description"
                  className="text-muted-foreground"
                >
                  {
                    formatGroupingMode(
                      groupingConfigured ? (field.value ?? "never") : "never",
                    ).description
                  }
                </p>
              </>
            )}
          />
        </div>
        {!groupingConfigured && (
          <p className="text-muted-foreground">
            Choose a Grouping model to enable grouping and summaries.
          </p>
        )}
        {settings.error && <p role="alert">{settings.error.message}</p>}
        <div className="flex flex-col gap-2">
          <label htmlFor="grouping-instructions">Grouping instructions</label>
          <Textarea
            id="grouping-instructions"
            disabled={!groupingConfigured || settings.isPending}
            className="h-48 max-h-80 text-base md:text-base"
            {...promptField}
            onChange={(event) => {
              void promptField.onChange(event);
              promptDraft.current = event.target.value;
              setSettingsSaveStatus("ai-prompt-draft", { status: "waiting" });
              promptDebouncer.maybeExecute();
            }}
            onBlur={(event) => {
              void promptField.onBlur(event);
              promptDebouncer.flush();
            }}
            aria-invalid={!!errors.prompt}
            aria-describedby="grouping-error"
          />
          <FieldError
            id="grouping-error"
            errors={[errors.prompt]}
            className="text-base"
          />
        </div>
        <Controller
          control={control}
          name="capacity"
          render={({ field }) => (
            <AiCapacitySettings
              connections={entries.map((entry) => entry.connection)}
              value={field.value ?? {}}
              onChange={(capacity) => {
                if (
                  JSON.stringify(capacity) === JSON.stringify(field.value ?? {})
                )
                  return;
                resetField("capacity", { defaultValue: capacity });
                save({ capacity });
              }}
              disabled={capacityStatus.data?.locked === true}
              unavailable={
                settings.isPending ||
                capacityStatus.isPending ||
                !!capacityStatus.error
              }
            />
          )}
        />
        <FieldError errors={[errors.capacity]} className="text-base" />
        <div className="flex flex-col gap-2">
          <label htmlFor="machine-concurrency">
            Total AI requests across workspaces
          </label>
          <p className="text-muted-foreground">
            Shared by running repositories using this application-data
            directory. Provider ceilings still apply.
          </p>
          <Controller
            control={control}
            name="machineConcurrency"
            render={({ field }) => (
              <NumberInput
                id="machine-concurrency"
                label="Total AI requests across workspaces"
                value={field.value ?? 4}
                min={1}
                max={64}
                disabled={
                  settings.isPending ||
                  capacityStatus.isPending ||
                  !!capacityStatus.error ||
                  capacityStatus.data?.locked
                }
                onValueChange={(machineConcurrency) => {
                  resetField("machineConcurrency", {
                    defaultValue: machineConcurrency,
                  });
                  save({ machineConcurrency });
                }}
              />
            )}
          />
          <FieldError
            errors={[errors.machineConcurrency]}
            className="text-base"
          />
        </div>
      </form>
      <section className="border-t pt-5 flex flex-col gap-3">
        <h3 className="font-medium">Configure Providers</h3>
        <p className="text-muted-foreground">
          Connections, API keys, endpoints, and available models.
        </p>
        <Button
          className="text-base"
          variant="outline"
          onClick={() =>
            navigation.navigate(getProviderSettingsSection(navigation, ""))
          }
        >
          Configure Providers
        </Button>
      </section>
    </div>
  );
};
