"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  isLocalEndpoint,
  isLocalInferenceProvider,
  isSubscriptionProvider,
  type ProviderConfigSchema,
} from "@senslop/contracts";
import { NumberInput } from "@senslop/ui/components/number-input";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { capacityBounds, capacityLockedMessage } from "../constants";
import { defaultConnectionCapacity } from "../lib/capacity";
import {
  formatCapacityFeedback,
  formatCapacityNumber,
  formatCapacitySetting,
} from "../lib/formatters";
import type { AiCapacitySchema, ConnectionCapacitySchema } from "../schemas";

type AiCapacitySettingsProps = {
  connections: (Pick<
    ProviderConfigSchema,
    "provider" | "name" | "contextWindow"
  > & { id: string })[];
  value: AiCapacitySchema;
  onChange: (value: AiCapacitySchema) => void;
  disabled: boolean;
  unavailable?: boolean;
  saving?: boolean;
};

export const AiCapacitySettings = ({
  connections,
  value,
  onChange,
  disabled,
  unavailable,
  saving,
}: AiCapacitySettingsProps) => {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const connection =
    connections.find((item) => item.id === selected) ?? connections[0];
  if (!connection)
    return (
      <p className="text-muted-foreground">
        Configure a provider connection to set AI capacity.
      </p>
    );
  const profile = value[connection.id] ?? defaultConnectionCapacity(connection);
  const update = (
    setting: keyof ConnectionCapacitySchema,
    next: number | null,
  ) => onChange({ ...value, [connection.id]: { ...profile, [setting]: next } });
  const locked = disabled || unavailable || saving;
  const input = (setting: keyof ConnectionCapacitySchema) => {
    const { label, description } = formatCapacitySetting(setting);
    const bounds = capacityBounds[setting];
    const optional =
      setting === "requestsPerMinute" ||
      setting === "inputTokensPerMinute" ||
      setting === "outputTokensPerMinute";
    const inputId = `${id}-${connection.id}-${setting}`;
    return (
      <div
        key={inputId}
        role="group"
        aria-label={label}
        className="flex flex-col gap-2"
      >
        <label htmlFor={inputId} className="font-medium">
          {label}
        </label>
        <p className="text-muted-foreground">{description}</p>
        <p className="text-muted-foreground">
          Minimum {formatCapacityNumber(bounds.min)}; maximum{" "}
          {formatCapacityNumber(bounds.max)}
          {optional ? "; optional" : ""}.
        </p>
        {optional && (
          <label className="flex items-center gap-3">
            <Switch
              checked={profile[setting] !== null}
              disabled={locked}
              onCheckedChange={(checked) =>
                update(
                  setting,
                  checked
                    ? setting === "requestsPerMinute"
                      ? 15
                      : setting === "inputTokensPerMinute"
                        ? 250000
                        : 32000
                    : null,
                )
              }
            />
            Limit {label.toLowerCase()}
          </label>
        )}
        <NumberInput
          id={inputId}
          label={label}
          value={profile[setting] ?? bounds.min}
          min={bounds.min}
          max={bounds.max}
          disabled={locked || profile[setting] === null}
          onValueChange={(next) => update(setting, next)}
        />
        <p aria-live="polite" className="text-muted-foreground">
          {formatCapacityFeedback(setting, profile)}
        </p>
      </div>
    );
  };
  const preset = (concurrency: number, batch: number, output: number) =>
    onChange({
      ...value,
      [connection.id]: {
        ...profile,
        concurrency,
        groupingInputTokens: batch,
        reviewInputTokens: batch,
        outputTokens: output,
      },
    });
  const local =
    isLocalInferenceProvider(connection.provider) ||
    (connection.provider === "openai-compatible" &&
      "baseURL" in connection &&
      typeof connection.baseURL === "string" &&
      isLocalEndpoint(connection.baseURL));
  return (
    <fieldset
      aria-label="AI capacity"
      disabled={locked}
      className="flex flex-col gap-5 pt-5 disabled:opacity-60"
    >
      <legend className="font-medium">AI capacity</legend>
      <p className="text-muted-foreground">
        Tune one value at a time for your hardware, model, or subscription.
        These are ceilings, not guaranteed throughput. Each run keeps a copy of
        its settings; saved changes apply to the next run.
      </p>
      {disabled && <p role="status">{capacityLockedMessage}</p>}
      {unavailable && (
        <p role="status">
          Capacity editing is unavailable until the app can confirm that no
          grouping or review is active.
        </p>
      )}
      <label htmlFor={`${id}-connection`}>Connection capacity</label>
      <Select
        value={connection.id}
        onValueChange={(next) => next && setSelected(next)}
        disabled={locked}
      >
        <SelectTrigger id={`${id}-connection`} className="w-full text-base">
          <SelectValue>{connection.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {connections.map((item) => (
            <SelectItem key={item.id} value={item.id} className="text-base">
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground">
        Applies to all models on this connection. Use a separate connection if
        models need different budgets. Connections to the same local endpoint
        share active slots and quota history. Limits cannot account for requests
        made outside Senslop.
      </p>
      {isSubscriptionProvider(connection.provider) && (
        <p className="text-muted-foreground">
          Subscription SDKs may perform several model turns inside one Senslop
          request. Request limits count Senslop calls. Context and output values
          are planning budgets where the subscription backend does not support
          hard token caps; usage limits remain estimates.
        </p>
      )}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Capacity presets"
      >
        <Button
          type="button"
          className="text-base"
          variant="outline"
          disabled={locked}
          onClick={() => preset(local ? 1 : 2, 4000, 2048)}
        >
          Conservative
        </Button>
        <Button
          type="button"
          className="text-base"
          variant="outline"
          disabled={locked}
          onClick={() => preset(local ? 1 : 4, 8000, 4096)}
        >
          Balanced
        </Button>
        <Button
          type="button"
          className="text-base"
          variant="outline"
          disabled={locked}
          onClick={() => preset(local ? 2 : 8, 32000, 16000)}
        >
          Higher throughput
        </Button>
      </div>
      <p className="text-muted-foreground">
        Presets adjust concurrency, batch targets, and output only. Check the
        context budget and your provider quotas separately.
      </p>
      {input("concurrency")}
      {input("requestsPerMinute")}
      {input("inputTokensPerMinute")}
      {input("contextTokens")}
      {input("outputTokens")}
      {input("groupingInputTokens")}
      {input("reviewInputTokens")}
      <Collapsible className="flex flex-col gap-3">
        <CollapsibleTrigger className="cursor-pointer flex items-center gap-2 justify-between group/advanced">
          <span>Advanced output quota</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-data-panel-open/advanced:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {input("outputTokensPerMinute")}
        </CollapsibleContent>
      </Collapsible>
    </fieldset>
  );
};
