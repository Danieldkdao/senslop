import type { DiffSettingsState } from "./types";

export const diffThemes = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;

export const lightDiffThemes = [
  "github-light",
  "github-light-default",
  "catppuccin-latte",
  "one-light",
  "solarized-light",
  "rose-pine-dawn",
  "vitesse-light",
  "min-light",
  "snazzy-light",
  "slack-ochin",
] as const;
export const darkDiffThemes = [
  "github-dark",
  "dracula",
  "one-dark-pro",
  "nord",
  "tokyo-night",
  "catppuccin-mocha",
  "monokai",
  "night-owl",
  "solarized-dark",
  "rose-pine",
] as const;
export const diffThemeValues = [
  "default",
  ...lightDiffThemes,
  ...darkDiffThemes,
] as const;
export const diffViews = ["split", "unified"] as const;
export const diffFonts = [
  "jetbrains-mono",
  "geist-mono",
  "fira-code",
  "ibm-plex-mono",
  "cascadia-code",
] as const;

export const diffIndicators = ["bars", "classic", "none"] as const;
export const inlineChangeStyles = [
  "word-alt",
  "word-line",
  "word",
  "char",
  "none",
] as const;
export const defaultDiffSettings: DiffSettingsState = {
  theme: "default",
  font: "jetbrains-mono",
  fontSize: 16,
  lineHeight: 26,
  indicators: "bars",
  inlineChanges: "word-alt",
  backgrounds: true,
  wrapping: false,
  lineNumbers: true,
};
