"use client";

import {
  useHotkeys,
  type UseHotkeyCommonOptions,
  type UseHotkeyDefinition,
  type RegisterableHotkey,
} from "@tanstack/react-hotkeys";
import { useEffect, useRef } from "react";
import { hasOpenKeyboardOverlay } from "../lib/keyboard-shortcuts";

export type KeyboardShortcutOptions = UseHotkeyCommonOptions & {
  allowInOverlays?: boolean;
  allowRepeat?: boolean;
  shouldHandle?: (event: KeyboardEvent) => boolean;
};

export type KeyboardShortcut = {
  hotkey: RegisterableHotkey;
  callback: (
    event: KeyboardEvent,
    context: Parameters<UseHotkeyDefinition["callback"]>[1] & {
      signal: AbortSignal;
    },
  ) => void;
  options?: KeyboardShortcutOptions;
};

export const useKeyboardShortcuts = (
  shortcuts: readonly KeyboardShortcut[],
  sharedOptions: KeyboardShortcutOptions = {},
) => {
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useHotkeys(
    shortcuts.map(({ hotkey, callback, options }) => {
      const {
        allowInOverlays = false,
        allowRepeat = false,
        shouldHandle,
        ...hotkeyOptions
      } = {
        ignoreInputs: true,
        preventDefault: true,
        stopPropagation: false,
        ...sharedOptions,
        ...options,
      };
      return {
        hotkey,
        // Consume only accepted events so overlays and focused widgets keep their keys.
        options: {
          ...hotkeyOptions,
          preventDefault: false,
          stopPropagation: false,
        },
        callback: (event, context) => {
          const signal = lifetime.current?.signal;
          if (
            !signal ||
            signal.aborted ||
            event.defaultPrevented ||
            event.isComposing ||
            (!allowRepeat && event.repeat) ||
            (!allowInOverlays && hasOpenKeyboardOverlay()) ||
            (shouldHandle && !shouldHandle(event))
          )
            return;
          if (hotkeyOptions.preventDefault) event.preventDefault();
          if (hotkeyOptions.stopPropagation) event.stopPropagation();
          callback(event, { ...context, signal });
        },
      };
    }),
  );
};
