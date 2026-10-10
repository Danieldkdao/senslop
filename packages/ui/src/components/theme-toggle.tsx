"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Palette } from "lucide-react";
import { themes } from "@/lib/constants";
import type { Theme } from "@/lib/types";
import { formatTheme } from "@/lib/formatters";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

const subscribeToHydration = () => () => {};

const formatThemeIcon = (theme: Theme) => {
  switch (theme) {
    case "light":
      return <Sun aria-hidden="true" className="size-4" />;
    case "dark":
      return <Moon aria-hidden="true" className="size-4" />;
    case "system":
      return <Monitor aria-hidden="true" className="size-4" />;
  }
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  // Stored appearance is only available after hydration; keep server markup stable.
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const mode: Theme =
    mounted && (theme === "light" || theme === "dark") ? theme : "system";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={!mounted}
        className="gap-3 py-2 text-base whitespace-nowrap"
      >
        <Palette aria-hidden="true" className="size-4" />
        Change theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value: Theme) => setTheme(value)}
        >
          {themes.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              closeOnClick
              className="gap-3 py-2 text-base"
            >
              {formatThemeIcon(option)}
              {formatTheme(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
