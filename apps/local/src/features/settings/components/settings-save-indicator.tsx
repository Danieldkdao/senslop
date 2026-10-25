"use client";

import { useSyncExternalStore } from "react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import {
  getServerSettingsSaveSnapshot,
  getSettingsSaveSnapshot,
  subscribeSettingsSave,
} from "../lib/settings-save-store";
import { formatSettingsSaveStatus } from "../lib/formatters";

export const SettingsSaveIndicator = () => {
  const state = useSyncExternalStore(
    subscribeSettingsSave,
    getSettingsSaveSnapshot,
    getServerSettingsSaveSnapshot,
  );
  const display = formatSettingsSaveStatus(state.status);
  return (
    <TooltipWrapper
      className="w-full"
      content={
        state.message ??
        (state.status === "invalid"
          ? "Fix the highlighted fields to save your changes automatically."
          : "Valid settings save automatically as you make changes.")
      }
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={0}
        className={cn(
          "flex w-full shrink-0 items-center gap-2 border-t px-1 pt-4 text-base",
          display.className,
        )}
      >
        <display.Icon
          aria-hidden="true"
          className={cn("size-4 shrink-0", display.iconClassName)}
        />
        <span>{display.label}</span>
      </div>
    </TooltipWrapper>
  );
};
