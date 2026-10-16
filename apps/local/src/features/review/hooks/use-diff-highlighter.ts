"use client";

import { useEffect, useState } from "react";
import {
  getFiletypeFromFileName,
  preloadHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { diffThemes } from "../constants";

export const useDiffHighlighter = (
  name: string | null,
  previousName?: string,
  language?: SupportedLanguages,
) => {
  const currentLanguage =
    name === null ? null : (language ?? getFiletypeFromFileName(name));
  const previousLanguage =
    name === null
      ? null
      : (language ?? getFiletypeFromFileName(previousName ?? name));
  const key = JSON.stringify([currentLanguage, previousLanguage]);
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
      themes: [diffThemes.dark, diffThemes.light],
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
  }, [currentLanguage, previousLanguage, key, attempt]);
  return {
    ready: name === null || (state?.key === key && state.ready),
    error: state?.key === key && state.error,
    retry: () => {
      setState(undefined);
      setAttempt((value) => value + 1);
    },
  };
};
