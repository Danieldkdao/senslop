"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { themes } from "@/lib/constants";
import { formatTheme } from "@/lib/formatters";
import type { Theme } from "@/lib/types";
import type { DiffSettingsState, DiffView } from "../../review/types";
import { DiffSettings } from "../../review/components/diff-settings";
import { ProviderSettings } from "../../providers/components/provider-settings";
import { ConnectionForm } from "../../providers/components/connection-form";
import { formatProvider } from "../../providers/lib/formatters";
import { providerIds } from "@senslop/contracts";
import { SettingsDialog } from "./settings-dialog";
import type { SettingsSection } from "../types";
import { EditorDiffPreview } from "./editor-diff-preview";

type ReviewSettingsProps = {
  settings: DiffSettingsState;
  onChange: (settings: DiffSettingsState) => void;
  view: DiffView;
  onViewChange: (view: DiffView) => void;
};

export const ReviewSettings = ({
  settings,
  onChange,
  view,
  onViewChange,
}: ReviewSettingsProps) => {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsDialog>
      {(navigation, search) => {
        const query = search.toLowerCase().trim();
        const sections: SettingsSection[] = [
          {
            id: "appearance",
            label: "Appearance",
            keywords: "appearance theme light dark system",
            content: (
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-theme">Theme</label>
                <Select<Theme>
                  value={
                    theme === "light" || theme === "dark" ? theme : "system"
                  }
                  onValueChange={(value) => {
                    if (value) setTheme(value);
                  }}
                >
                  <SelectTrigger
                    id="settings-theme"
                    className="w-full max-w-xs text-base"
                  >
                    <SelectValue>
                      {formatTheme(
                        theme === "light" || theme === "dark"
                          ? theme
                          : "system",
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {formatTheme(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ),
          },
          {
            id: "editor",
            label: "Editor",
            keywords:
              "editor review diff preview split unified indicators inline changes wrapping backgrounds line numbers",
            content: (
              <>
                <div className="space-y-2">
                  <p>Diff view</p>
                  <div
                    role="group"
                    aria-label="Diff view"
                    className="flex gap-2"
                  >
                    <Button
                      variant={view === "split" ? "secondary" : "ghost"}
                      aria-pressed={view === "split"}
                      onClick={() => onViewChange("split")}
                    >
                      Split
                    </Button>
                    <Button
                      variant={view === "unified" ? "secondary" : "ghost"}
                      aria-pressed={view === "unified"}
                      onClick={() => onViewChange("unified")}
                    >
                      Unified
                    </Button>
                  </div>
                </div>
                <DiffSettings settings={settings} onChange={onChange} />
                <EditorDiffPreview settings={settings} view={view} />
              </>
            ),
          },
          {
            id: "providers",
            label: "Providers",
            links: providerIds
              .filter(
                (provider) =>
                  !query ||
                  `providers api key model endpoint ${formatProvider(provider).label}`
                    .toLowerCase()
                    .includes(query),
              )
              .map((provider) => ({
                id: `settings-provider-${provider}`,
                label: formatProvider(provider).label,
              })),
            keywords: `providers api key model endpoint ${providerIds.map((provider) => formatProvider(provider).label).join(" ")}`,
            content: (
              <ProviderSettings
                search={query}
                onConfigure={(provider, connection, reload) =>
                  navigation.navigate({
                    id: connection?.id ?? provider,
                    label: formatProvider(provider).label,
                    content: (
                      <ConnectionForm
                        provider={provider}
                        connection={connection}
                        onSaved={async () => {
                          await reload();
                        }}
                      />
                    ),
                  })
                }
              />
            ),
          },
        ];
        return sections.map((section) => ({
          ...section,
          visible: !query || section.keywords.toLowerCase().includes(query),
        }));
      }}
    </SettingsDialog>
  );
};
