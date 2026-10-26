"use client";

import {
  useKeyboardShortcuts,
  type KeyboardShortcut,
} from "@senslop/ui/hooks/use-keyboard-shortcuts";

export const useWorkspaceToolbarShortcuts = () => {
  const actions = [
    ["Alt+ArrowLeft", ["Back in reading history"]],
    ["Alt+ArrowRight", ["Forward in reading history"]],
    ["Shift+G", ["Regroup changes", "Group changes"]],
    ["N", ["Add note"]],
    ["F", ["Focus reading", "Exit focused reading"]],
    ["Shift+R", ["Refresh repository"]],
    ["Shift+S", ["Re-sync review"]],
    ["I", ["Captured context and model routing"]],
    ["B", ["Review rounds"]],
    ["P", ["Review report"]],
    ["G", ["Git"]],
    ["Shift+N", ["New review"]],
    ["U", ["Update available"]],
    ["Shift+F", ["Open files"]],
    ["Shift+A", ["Open agents"]],
  ] as const;
  const target = (labels: readonly string[]) =>
    labels
      .flatMap((label) =>
        Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            `main[aria-label="Review canvas"] header button[aria-label="${label}"]`,
          ),
        ),
      )
      .find(
        (button) =>
          !button.disabled && button.getAttribute("aria-disabled") !== "true",
      );
  useKeyboardShortcuts(
    actions.map(([hotkey, labels]) => ({
      hotkey: hotkey as KeyboardShortcut["hotkey"],
      callback: () => target(labels)?.click(),
      options: { shouldHandle: () => !!target(labels) },
    })),
  );
};
