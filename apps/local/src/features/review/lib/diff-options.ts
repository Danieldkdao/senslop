import type { BaseDiffOptions } from "@pierre/diffs";
import type { DiffSettingsState, DiffView } from "../types";
import { diffThemes } from "../constants";

export const getDiffOptions = (
  settings: DiffSettingsState,
  view: DiffView,
  resolvedTheme: string | undefined,
) =>
  ({
    // Pierre supplies syntax token colors; change markers use Senslop's semantic colors.
    theme: diffThemes,
    themeType: resolvedTheme === "dark" ? "dark" : "light",
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
