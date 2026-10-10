"use client";

import { useEffect, useRef, useState } from "react";
import { providerIds, type ProviderId } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { ProviderIcon } from "../../../components/provider-icon";
import { ProviderSettingsDialog } from "../../settings/components/provider-settings-dialog";
import { useProviderModels } from "../hooks/use-provider-models";
import { formatModelOptionName, formatProvider } from "../lib/formatters";
import { matchesCatalogModel, normalizeModels } from "../lib/normalize-models";
import type { ModelSelection } from "../model-schemas";
import { ManualModelForm } from "./manual-model-form";

type PickerItem = ModelSelection & {
  provider: ProviderId;
  connectionName: string;
  available: boolean;
  placeholder?: boolean;
  aliases?: string[];
};
type PickerGroup = { provider: ProviderId; items: PickerItem[] };
type ModelPickerProps = {
  value: ModelSelection | null;
  onChange: (value: ModelSelection | null) => void;
  disabled?: boolean;
};

export const ModelPicker = ({
  value,
  onChange,
  disabled = false,
}: ModelPickerProps) => {
  const { settings, entries, refresh } = useProviderModels();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const initialized = useRef(false);
  const groups: PickerGroup[] = providerIds.flatMap((provider) => {
    const providerEntries = entries.filter(
      (entry) => entry.connection.provider === provider,
    );
    const items = providerEntries.flatMap((entry): PickerItem[] => {
      const models = entry.error ? [] : (entry.catalog?.models ?? []);
      if (!models.length)
        return [
          {
            connectionId: entry.connection.id,
            modelId: "",
            name: entry.pending
              ? "Loading models…"
              : "Models unavailable. Check Configure.",
            provider,
            connectionName: entry.connection.name,
            available: false,
            placeholder: true,
          },
        ];
      return normalizeModels(models).map((model) => ({
        connectionId: entry.connection.id,
        modelId: model.id,
        name: model.name,
        provider,
        connectionName: entry.connection.name,
        available: model.available,
        aliases: model.aliases,
      }));
    });
    const nameCounts = new Map<string, number>();
    const connectionNameCounts = new Map<string, number>();
    for (const item of items) {
      nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1);
      const key = JSON.stringify([item.name, item.connectionName]);
      connectionNameCounts.set(key, (connectionNameCounts.get(key) ?? 0) + 1);
    }
    return items.length
      ? [
          {
            provider,
            items: items.map((item) =>
              nameCounts.get(item.name)! > 1
                ? {
                    ...item,
                    name: formatModelOptionName(
                      item.name,
                      item.connectionName,
                      connectionNameCounts.get(
                        JSON.stringify([item.name, item.connectionName]),
                      )! > 1
                        ? providerEntries.findIndex(
                            (entry) =>
                              entry.connection.id === item.connectionId,
                          ) + 1
                        : undefined,
                    ),
                  }
                : item,
            ),
          },
        ]
      : [];
  });
  const selectionConnection = entries.find(
    (entry) => entry.connection.id === value?.connectionId,
  );
  const selectedItem: PickerItem | null =
    value && selectionConnection
      ? (groups
          .flatMap((group) => group.items)
          .find(
            (item) =>
              item.connectionId === value.connectionId &&
              (item.modelId === value.modelId ||
                item.aliases?.includes(value.modelId)),
          ) ?? {
          ...value,
          provider: selectionConnection.connection.provider,
          connectionName: selectionConnection.connection.name,
          available: true,
        })
      : null;
  const manualConnections = entries
    .filter((entry) => entry.catalog?.manualAllowed)
    .map((entry) => entry.connection);
  useEffect(() => {
    if (!settings.data) return;
    if (value) {
      const entry = entries.find(
        (entry) => entry.connection.id === value.connectionId,
      );
      if (
        !entry ||
        entry.error ||
        (entry.catalog &&
          !(value.manual && entry.catalog.manualAllowed) &&
          entry.catalog.source !== "manual" &&
          !entry.catalog.models.some(
            (model) =>
              matchesCatalogModel(model, value.modelId) && model.available,
          ))
      )
        onChange(null);
      initialized.current = true;
      return;
    }
    if (initialized.current) return;
    const entry = entries.find(
      (entry) => entry.connection.id === settings.data.defaultId,
    );
    if (entry?.pending) return;
    initialized.current = true;
    const model = entry?.catalog?.models.find(
      (model) =>
        matchesCatalogModel(model, entry.connection.model) && model.available,
    );
    if (entry && model)
      onChange({
        connectionId: entry.connection.id,
        modelId: entry.connection.model,
        name: model.name,
      });
  }, [settings.data, entries, value, onChange]);
  return (
    <>
      <Combobox<PickerItem>
        items={groups}
        value={selectedItem}
        onValueChange={(item) => {
          if (item)
            onChange({
              connectionId: item.connectionId,
              modelId: item.modelId,
              name: item.name,
            });
        }}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        isItemEqualToValue={(item, selected) =>
          item.connectionId === selected.connectionId &&
          item.modelId === selected.modelId
        }
        itemToStringLabel={(item) => item.name}
        itemToStringValue={(item) => `${item.connectionId}:${item.modelId}`}
        filter={(item, query) =>
          `${item.name} ${item.modelId} ${item.aliases?.join(" ") ?? ""} ${item.connectionName} ${formatProvider(item.provider).label}`
            .toLowerCase()
            .includes(query.toLowerCase())
        }
      >
        <ComboboxTrigger
          render={<Button variant="outline" className="max-w-full text-base" />}
          aria-label={
            value
              ? `Model: ${selectedItem?.name ?? value.name}`
              : "Select a model"
          }
        >
          {selectionConnection && (
            <ProviderIcon
              name={
                formatProvider(selectionConnection.connection.provider).icon
              }
              size={20}
              aria-hidden="true"
            />
          )}
          <span className="truncate">
            {selectedItem?.name ?? value?.name ?? "Select a model…"}
          </span>
        </ComboboxTrigger>
        <ComboboxContent className="w-[min(28rem,calc(100vw-2rem))] min-w-0 text-base">
          <ComboboxInput
            aria-label="Search models"
            placeholder="Select a model…"
            showTrigger={false}
            className="text-base **:data-[slot=input-group-control]:text-base"
          />
          {settings.isPending && (
            <p role="status" className="p-3 text-muted-foreground">
              Loading providers…
            </p>
          )}
          {settings.error && (
            <p role="alert" className="p-3">
              Providers unavailable. Check Configure.
            </p>
          )}
          <ComboboxEmpty className="text-base p-3">
            {entries.length
              ? "No matching models."
              : "Configure a provider to choose a model."}
          </ComboboxEmpty>
          <ComboboxList>
            {(group: PickerGroup) => (
              <ComboboxGroup key={group.provider} items={group.items}>
                <ComboboxLabel className="text-base py-3">
                  {formatProvider(group.provider).label}
                </ComboboxLabel>
                <ComboboxCollection>
                  {(item: PickerItem) => (
                    <ComboboxItem
                      key={`${item.connectionId}:${item.modelId}`}
                      value={item}
                      disabled={!item.available}
                      className="gap-3 text-base py-3"
                    >
                      {!item.placeholder && (
                        <ProviderIcon
                          name={formatProvider(item.provider).icon}
                          size={22}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                      )}
                      <span className="truncate">{item.name}</span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
          <div className="border-t p-2 flex flex-col gap-2">
            {!!manualConnections.length && (
              <Button
                variant="ghost"
                className="w-full text-base"
                onClick={() => {
                  setOpen(false);
                  setManualOpen(true);
                }}
              >
                Enter model ID
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full text-base"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
            >
              Configure
            </Button>
          </div>
        </ComboboxContent>
      </Combobox>
      <ProviderSettingsDialog
        open={settingsOpen}
        onOpenChange={(next) => {
          setSettingsOpen(next);
          if (!next) void refresh();
        }}
      />
      {manualOpen && (
        <ManualModelForm
          connections={manualConnections}
          open={manualOpen}
          onOpenChange={setManualOpen}
          onSelect={onChange}
        />
      )}
    </>
  );
};
