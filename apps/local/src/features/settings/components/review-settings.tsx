"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { applicationThemes } from "@/lib/constants";
import { formatApplicationTheme } from "@/lib/formatters";
import type { ApplicationTheme } from "@/lib/types";
import { ApplicationThemeSelect } from "./application-theme-select";
import type { DiffSettingsState, DiffView } from "../../review/types";
import { DiffSettings } from "../../review/components/diff-settings";
import { getProviderSettingsSection } from "./provider-settings-dialog";
import { AiSettings } from "../../agents/components/ai-settings";
import { SettingsDialog } from "./settings-dialog";
import type { SettingsSection } from "../types";
import { EditorDiffPreview } from "./editor-diff-preview";
import { ReviewPreferences } from "./review-preferences";
import { BuddySettings } from "../../buddy/components/buddy-settings";

type ReviewSettingsProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialSection?: string;
  settings: DiffSettingsState;
  onChange: (settings: DiffSettingsState) => void;
  view: DiffView;
  onViewChange: (view: DiffView) => void;
  onApplicationThemeChange?: (theme: ApplicationTheme) => void;
  preferencesLoading?: boolean;
  preferencesError?: string;
  onRetryPreferences?: () => void;
};

export const ReviewSettings = ({
  open,
  onOpenChange,
  initialSection,
  settings,
  onChange,
  view,
  onViewChange,
  onApplicationThemeChange,
  preferencesLoading,
  preferencesError,
  onRetryPreferences,
}: ReviewSettingsProps) => {
  const [previewSettings, setPreviewSettings] =
    useState<Partial<DiffSettingsState> | null>(null);
  return (
    <SettingsDialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setPreviewSettings(null);
        onOpenChange?.(value);
      }}
      initialSection={initialSection}
    >
      {(navigation, search) => {
        const query = search.toLowerCase().trim();
        const providers = getProviderSettingsSection(navigation, "");
        const sections: SettingsSection[] = [
          {
            id: "appearance",
            label: "Appearance",
            keywords: `appearance theme light dark system buddy pip mascot show hide animations position size preview ${applicationThemes.map(formatApplicationTheme).join(" ")}`,
            content: (
              <div className="flex flex-col gap-5">
                <ApplicationThemeSelect
                  disabled={preferencesLoading || !!preferencesError}
                  onChange={onApplicationThemeChange}
                />
                <BuddySettings />
              </div>
            ),
          },
          {
            id: "review-preferences",
            label: "Review Preferences",
            keywords:
              "review preferences automatic auto advance next file completion complete navigation",
            content: <ReviewPreferences />,
          },
          {
            id: "editor",
            label: "Editor",
            keywords:
              "editor review diff preview theme font size line height split unified indicators inline changes wrapping backgrounds line numbers",
            content: (
              <>
                {preferencesLoading && (
                  <p role="status">Loading saved editor settings…</p>
                )}
                {preferencesError && (
                  <div
                    role="alert"
                    className="flex flex-col gap-2 text-destructive"
                  >
                    <p>{preferencesError}</p>
                    <Button variant="outline" onClick={onRetryPreferences}>
                      Retry loading settings
                    </Button>
                  </div>
                )}
                <fieldset
                  disabled={preferencesLoading || !!preferencesError}
                  className="flex min-w-0 flex-col gap-5 disabled:opacity-60"
                >
                  <div className="flex flex-col gap-2">
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
                  <EditorDiffPreview
                    settings={{ ...settings, ...previewSettings }}
                    view={view}
                  />
                  <DiffSettings
                    settings={settings}
                    onChange={onChange}
                    onPreviewChange={setPreviewSettings}
                  />
                </fieldset>
              </>
            ),
          },
          {
            id: "ai",
            label: "AI",
            keywords: `ai models grouping context review explain ${providers.keywords}`,
            content: <AiSettings navigation={navigation} />,
            links: [
              {
                id: "providers",
                label: "Providers",
                onSelect: () => navigation.navigate(providers),
              },
            ],
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
