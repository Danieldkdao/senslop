import type { Theme, ApplicationTheme } from "./types";

export const formatApplicationTheme = (theme: ApplicationTheme) => {
  switch (theme) {
    case "system":
      return "System";
    case "light":
      return "Default Light";
    case "dark":
      return "Default Dark";
    case "paper-light":
      return "Paper";
    case "linen-light":
      return "Linen";
    case "sage-light":
      return "Sage";
    case "mist-light":
      return "Mist";
    case "lavender-light":
      return "Lavender";
    case "rosewater-light":
      return "Rosewater";
    case "sand-light":
      return "Sand";
    case "lagoon-light":
      return "Lagoon";
    case "peach-light":
      return "Peach";
    case "nord-dark":
      return "Nord";
    case "rose-pine-dark":
      return "Rosé Pine";
    case "mocha-dark":
      return "Mocha";
    case "forest-dark":
      return "Forest";
    case "deep-sea-dark":
      return "Deep Sea";
    case "graphite-dark":
      return "Graphite";
    case "aubergine-dark":
      return "Aubergine";
    case "espresso-dark":
      return "Espresso";
    case "midnight-dark":
      return "Midnight";
  }
};

export const formatApplicationThemeMode = (
  theme: string | undefined,
  systemTheme: "light" | "dark" = "light",
) => {
  switch (theme) {
    case "system":
      return systemTheme;
    case "dark":
    case "nord-dark":
    case "rose-pine-dark":
    case "mocha-dark":
    case "forest-dark":
    case "deep-sea-dark":
    case "graphite-dark":
    case "aubergine-dark":
    case "espresso-dark":
    case "midnight-dark":
      return "dark";
    default:
      return "light";
  }
};

export const formatTheme = (theme: Theme) => {
  switch (theme) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "System";
  }
};

export const formatUserInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return `${first}${last}`.toUpperCase();
};
