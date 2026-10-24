"use client";

import { providerIds } from "@senslop/contracts";
import { ProviderSettings } from "../../providers/components/provider-settings";
import { ConnectionForm } from "../../providers/components/connection-form";
import { CompatibleProviderForm } from "../../providers/components/compatible-provider-form";
import { formatProvider } from "../../providers/lib/formatters";
import type { SettingsNavigation, SettingsSection } from "../types";
import { SettingsDialog } from "./settings-dialog";

export const getProviderSettingsSection = (
  navigation: SettingsNavigation,
  query: string,
): SettingsSection => ({
  id: "providers",
  label: "Providers",
  keywords: `providers api key model endpoint ${providerIds.map((provider) => formatProvider(provider).label).join(" ")}`,
  content: (
    <ProviderSettings
      search={query}
      onConfigure={(provider, connection) =>
        navigation.navigate({
          id: connection?.id ?? provider,
          label:
            provider === "openai-compatible"
              ? connection
                ? `Configure ${connection.name}`
                : "Add OpenAI-Compatible Provider"
              : formatProvider(provider).label,
          content:
            provider === "openai-compatible" ? (
              <CompatibleProviderForm
                connection={connection}
                onCancel={navigation.back}
                onSaved={() => navigation.back()}
              />
            ) : (
              <ConnectionForm provider={provider} connection={connection} />
            ),
        })
      }
    />
  ),
});

type ProviderSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ProviderSettingsDialog = ({
  open,
  onOpenChange,
}: ProviderSettingsDialogProps) => (
  <SettingsDialog
    open={open}
    onOpenChange={onOpenChange}
    initialSection="providers"
    hideTrigger
  >
    {(navigation, search) => {
      const query = search.trim().toLowerCase();
      const section = getProviderSettingsSection(navigation, query);
      return [
        {
          ...section,
          visible: !query || section.keywords.toLowerCase().includes(query),
        },
      ];
    }}
  </SettingsDialog>
);
