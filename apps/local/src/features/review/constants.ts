import type { DiffSettingsState } from "./types";

export const diffThemes = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;

export const diffIndicators = ["bars", "classic", "none"] as const;
export const inlineChangeStyles = [
  "word-alt",
  "word-line",
  "word",
  "char",
  "none",
] as const;
export const defaultDiffSettings: DiffSettingsState = {
  indicators: "bars",
  inlineChanges: "word-alt",
  backgrounds: true,
  wrapping: false,
  lineNumbers: true,
};
