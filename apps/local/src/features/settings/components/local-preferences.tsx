"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { applicationThemes } from "@/lib/constants";
import { useUiPreferences } from "../hooks/use-ui-preferences";

export const LocalPreferences = ({ children }: { children: ReactNode }) => {
  const { theme, setTheme } = useTheme();
  const { preferences, values, save } = useUiPreferences();
  const migrated = useRef(false);
  useEffect(() => {
    if (!preferences.data || !theme || migrated.current) return;
    migrated.current = true;
    if (preferences.data.applicationTheme === null) {
      const applicationTheme =
        applicationThemes.find((value) => value === theme) ?? "system";
      save({ applicationTheme });
    }
  }, [preferences.data, theme, save]);
  useEffect(() => {
    if (values.applicationTheme !== null) setTheme(values.applicationTheme);
  }, [values.applicationTheme, setTheme]);
  return children;
};
