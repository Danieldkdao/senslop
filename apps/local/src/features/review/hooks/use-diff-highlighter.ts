"use client";

import { useEffect, useState } from "react";
import {
  getFiletypeFromFileName,
  preloadHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { diffThemes, lightDiffThemes, darkDiffThemes } from "../constants";
import type { DiffTheme } from "../types";

export const useDiffHighlighter = (
  name: string | null,
  previousName?: string,
  language?: SupportedLanguages,
  theme: DiffTheme = "default",
  preloadAllThemes = false,
) => {
  const currentLanguage =
    name === null ? null : (language ?? getFiletypeFromFileName(name));
  const previousLanguage =
    name === null
      ? null
      : (language ?? getFiletypeFromFileName(previousName ?? name));
  const themeKey = preloadAllThemes ? "all" : theme;
  const key = JSON.stringify([currentLanguage, previousLanguage, themeKey]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    ready: boolean;
    error: boolean;
  }>();
  useEffect(() => {
    if (currentLanguage === null || previousLanguage === null) return;
    let active = true;
    // Cold async markup can be mistaken for hydrated content during Strict Mode remounts.
    void preloadHighlighter({
      themes:
        themeKey === "all"
          ? [
              diffThemes.dark,
              diffThemes.light,
              ...lightDiffThemes,
              ...darkDiffThemes,
            ]
          : themeKey === "default"
            ? [diffThemes.dark, diffThemes.light]
            : [themeKey],
      langs: [...new Set([currentLanguage, previousLanguage])],
    })
      .then(() => {
        if (active) setState({ key, ready: true, error: false });
      })
      .catch(() => {
        if (active) setState({ key, ready: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [currentLanguage, previousLanguage, themeKey, key, attempt]);
  return {
    ready: name === null || (state?.key === key && state.ready),
    error: state?.key === key && state.error,
    retry: () => {
      setState(undefined);
      setAttempt((value) => value + 1);
    },
  };
};
