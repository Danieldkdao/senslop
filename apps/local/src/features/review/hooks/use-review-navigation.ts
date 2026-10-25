"use client";

import { useCallback, useState } from "react";
import { useKeyboardShortcuts } from "@senslop/ui/hooks/use-keyboard-shortcuts";
import type { LivePreview } from "../types";

type ReviewNavigationOptions = {
  preview: LivePreview | null;
  selectedPath?: string;
  onSelect: (path: string) => void;
  onToggleCompletion?: () => void;
  onNavigate?: (direction: -1 | 1) => void;
};

export const useReviewNavigation = ({
  preview,
  selectedPath,
  onSelect,
  onToggleCompletion,
  onNavigate,
}: ReviewNavigationOptions) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigateFile = useCallback(
    (direction: -1 | 1) => {
      if (onNavigate) {
        onNavigate(direction);
        return;
      }
      const index =
        preview?.files.findIndex((file) => file.path === selectedPath) ?? -1;
      if (index < 0) return;
      const file = preview?.files[index + direction];
      if (file) onSelect(file.path);
    },
    [preview, selectedPath, onSelect, onNavigate],
  );

  useKeyboardShortcuts(
    [
      { hotkey: "K", callback: () => setSearchOpen(true) },
      {
        hotkey: "D",
        callback: () => onToggleCompletion?.(),
        options: { shouldHandle: () => !!onToggleCompletion },
      },
      {
        hotkey: "ArrowLeft",
        callback: () => navigateFile(-1),
        options: { allowRepeat: true },
      },
      {
        hotkey: "ArrowRight",
        callback: () => navigateFile(1),
        options: { allowRepeat: true },
      },
    ],
    { enabled: !!preview && !searchOpen },
  );

  return { searchOpen, setSearchOpen, navigateFile };
};
