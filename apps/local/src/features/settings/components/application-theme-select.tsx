"use client";

import { useId, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  applicationThemes,
  darkApplicationThemes,
  lightApplicationThemes,
} from "@/lib/constants";
import { formatApplicationTheme } from "@/lib/formatters";
import type { ApplicationTheme } from "@/lib/types";
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

const subscribeToHydration = () => () => {};

export const ApplicationThemeSelect = () => {
  const id = useId();
  const { theme, systemTheme, setTheme } = useTheme();
  const [preview, setPreview] = useState<ApplicationTheme | null>(null);
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const selected =
    applicationThemes.find((value) => value === theme) ?? "system";
  useLayoutEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const apply = (value: ApplicationTheme) => {
      const resolved = value === "system" ? (systemTheme ?? "light") : value;
      root.classList.remove(...applicationThemes);
      root.classList.add(resolved);
      root.setAttribute("data-theme", resolved);
    };
    // Hover changes only the rendered palette; next-themes owns the saved choice.
    apply(preview ?? selected);
    root.toggleAttribute("data-theme-preview", open);
    return () => {
      apply(selected);
      root.removeAttribute("data-theme-preview");
    };
  }, [mounted, preview, selected, systemTheme, open]);
  const item = (value: ApplicationTheme) => (
    <SelectItem
      key={value}
      value={value}
      className="text-base"
      onPointerEnter={() => setPreview(value)}
      onFocus={() => setPreview(value)}
    >
      {formatApplicationTheme(value)}
    </SelectItem>
  );
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id}>Application theme</label>
      <Select<ApplicationTheme>
        value={mounted ? selected : "system"}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setPreview(null);
        }}
        onValueChange={(value) => {
          if (value) {
            setPreview(null);
            setTheme(value);
          }
        }}
      >
        <SelectTrigger
          id={id}
          disabled={!mounted}
          className="w-full max-w-xs text-base"
        >
          <SelectValue>
            {formatApplicationTheme(mounted ? selected : "system")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          onPointerLeave={() => setPreview(null)}
        >
          {item("system")}
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-base">Light themes</SelectLabel>
            {lightApplicationThemes.map(item)}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-base">Dark themes</SelectLabel>
            {darkApplicationThemes.map(item)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
