"use client";

import { useId } from "react";
import { NumberInput } from "@senslop/ui/components/number-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { darkDiffThemes, diffFonts, lightDiffThemes } from "../constants";
import { formatDiffFont, formatDiffTheme } from "../lib/formatters";
import type { DiffSettingsState, DiffTheme } from "../types";

type DiffAppearanceSettingsProps = {
  settings: DiffSettingsState;
  onChange: (settings: DiffSettingsState) => void;
  onPreviewChange?: (settings: Partial<DiffSettingsState> | null) => void;
};

export const DiffAppearanceSettings = ({
  settings,
  onChange,
  onPreviewChange,
}: DiffAppearanceSettingsProps) => {
  const id = useId();
  const themeItem = (theme: DiffTheme) => (
    <SelectItem
      key={theme}
      value={theme}
      className="text-base"
      onPointerEnter={() => onPreviewChange?.({ theme })}
      onFocus={() => onPreviewChange?.({ theme })}
    >
      {formatDiffTheme(theme)}
    </SelectItem>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-theme`} className="font-medium">
          Editor theme
        </label>
        <Select<DiffTheme>
          value={settings.theme}
          onValueChange={(theme) => {
            if (theme) onChange({ ...settings, theme });
          }}
          onOpenChange={(open) => {
            if (!open) onPreviewChange?.(null);
          }}
        >
          <SelectTrigger id={`${id}-theme`} className="w-full text-base">
            <SelectValue>{formatDiffTheme(settings.theme)}</SelectValue>
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            onPointerLeave={() => onPreviewChange?.(null)}
          >
            {themeItem("default")}
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-base">Light themes</SelectLabel>
              {lightDiffThemes.map(themeItem)}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-base">Dark themes</SelectLabel>
              {darkDiffThemes.map(themeItem)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-font`} className="font-medium">
          Editor font
        </label>
        <Select<DiffSettingsState["font"]>
          value={settings.font}
          onValueChange={(font) => {
            if (font) onChange({ ...settings, font });
          }}
          onOpenChange={(open) => {
            if (!open) onPreviewChange?.(null);
          }}
        >
          <SelectTrigger id={`${id}-font`} className="w-full text-base">
            <SelectValue>{formatDiffFont(settings.font).label}</SelectValue>
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            onPointerLeave={() => onPreviewChange?.(null)}
          >
            {diffFonts.map((font) => (
              <SelectItem
                key={font}
                value={font}
                className="text-base"
                onPointerEnter={() => onPreviewChange?.({ font })}
                onFocus={() => onPreviewChange?.({ font })}
              >
                {formatDiffFont(font).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`${id}-size`} className="font-medium">
          Font size
        </label>
        <NumberInput
          id={`${id}-size`}
          label="Font size"
          min={12}
          max={32}
          value={settings.fontSize}
          unit="px"
          onValueChange={(fontSize) => onChange({ ...settings, fontSize })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={`${id}-height`} className="font-medium">
          Line height
        </label>
        <NumberInput
          id={`${id}-height`}
          label="Line height"
          min={16}
          max={28}
          value={settings.lineHeight}
          unit="px"
          onValueChange={(lineHeight) => onChange({ ...settings, lineHeight })}
        />
      </div>
    </div>
  );
};
