import type { BaseDiffOptions } from "@pierre/diffs";
import type { CSSProperties } from "react";
import type { DiffSettingsState, DiffView } from "../types";
import { diffThemes, lightDiffThemes } from "../constants";
import { formatDiffFont } from "./formatters";

export const getDiffStyle = (
  settings: DiffSettingsState,
): CSSProperties & Record<`--diffs-${string}`, string> => ({
  "--diffs-font-family": formatDiffFont(settings.font).fontFamily,
  "--diffs-font-size": `${settings.fontSize}px`,
  "--diffs-line-height": `${settings.lineHeight}px`,
});

export const getDiffOptions = (
  settings: DiffSettingsState,
  view: DiffView,
  resolvedTheme: string | undefined,
) =>
  ({
    theme: settings.theme === "default" ? diffThemes : settings.theme,
    themeType:
      settings.theme === "default"
        ? resolvedTheme === "dark"
          ? "dark"
          : "light"
        : lightDiffThemes.some((theme) => theme === settings.theme)
          ? "light"
          : "dark",
    diffStyle: view,
    disableFileHeader: true,
    hunkSeparators: "line-info",
    expansionLineCount: 20,
    diffIndicators: settings.indicators,
    lineDiffType: settings.inlineChanges,
    disableBackground: !settings.backgrounds,
    overflow: settings.wrapping ? "wrap" : "scroll",
    disableLineNumbers: !settings.lineNumbers,
  }) satisfies BaseDiffOptions;
