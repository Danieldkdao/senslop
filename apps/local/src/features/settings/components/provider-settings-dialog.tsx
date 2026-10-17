"use client";

import { providerIds } from "@senslop/contracts";
import { ProviderSettings } from "../../providers/components/provider-settings";
import { ConnectionForm } from "../../providers/components/connection-form";
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
          label: formatProvider(provider).label,
          content: (
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
