"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  diffIndicators,
  inlineChangeStyles,
  whitespaceModes,
} from "../constants";
import {
  formatWhitespaceMode,
  formatDiffIndicator,
  formatInlineChangeStyle,
} from "../lib/formatters";
import type { DiffSettingsState } from "../types";
import { DiffAppearanceSettings } from "./diff-appearance-settings";

type DiffSettingsProps = {
  settings: DiffSettingsState;
  onChange: (settings: DiffSettingsState) => void;
  onPreviewChange?: (settings: Partial<DiffSettingsState> | null) => void;
};

export const DiffSettings = ({
  settings,
  onChange,
  onPreviewChange,
}: DiffSettingsProps) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-5 text-base">
      <DiffAppearanceSettings
        settings={settings}
        onChange={onChange}
        onPreviewChange={onPreviewChange}
      />
      <div className="grid gap-2">
        <p id={`${id}-indicators`} className="font-medium">
          Change indicators
        </p>
        <div
          className="flex gap-1 rounded-lg bg-muted p-1"
          role="group"
          aria-labelledby={`${id}-indicators`}
        >
          {diffIndicators.map((indicator) => (
            <Button
              key={indicator}
              className="min-w-0 flex-1"
              variant={
                settings.indicators === indicator ? "secondary" : "ghost"
              }
              aria-pressed={settings.indicators === indicator}
              onClick={() => onChange({ ...settings, indicators: indicator })}
            >
              {formatDiffIndicator(indicator)}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <label htmlFor={`${id}-inline`} className="font-medium">
          Inline changes
        </label>
        <Select<DiffSettingsState["inlineChanges"]>
          value={settings.inlineChanges}
          onValueChange={(inlineChanges) => {
            if (inlineChanges) onChange({ ...settings, inlineChanges });
          }}
        >
          <SelectTrigger id={`${id}-inline`} className="w-full text-base">
            <SelectValue>
              {formatInlineChangeStyle(settings.inlineChanges)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {inlineChangeStyles.map((style) => (
              <SelectItem key={style} value={style} className="text-base">
                {formatInlineChangeStyle(style)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-whitespace`} className="font-medium">
          Whitespace
        </label>
        <Select
          value={settings.whitespace ?? "all"}
          onValueChange={(value) => {
            const mode = whitespaceModes.find((mode) => mode === value);
            if (mode) onChange({ ...settings, whitespace: mode });
          }}
        >
          <SelectTrigger id={`${id}-whitespace`} className="w-full text-base">
            <SelectValue>
              {formatWhitespaceMode(settings.whitespace ?? "all")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {whitespaceModes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {formatWhitespaceMode(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground">
          Display filters preserve frozen evidence and completion. Whitespace
          may affect behavior.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${id}-backgrounds`}>Backgrounds</label>
        <Switch
          id={`${id}-backgrounds`}
          checked={settings.backgrounds}
          onCheckedChange={(backgrounds) =>
            onChange({ ...settings, backgrounds })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${id}-wrapping`}>Wrapping</label>
        <Switch
          id={`${id}-wrapping`}
          checked={settings.wrapping}
          onCheckedChange={(wrapping) => onChange({ ...settings, wrapping })}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${id}-numbers`}>Line numbers</label>
        <Switch
          id={`${id}-numbers`}
          checked={settings.lineNumbers}
          onCheckedChange={(lineNumbers) =>
            onChange({ ...settings, lineNumbers })
          }
        />
      </div>
    </div>
  );
};
