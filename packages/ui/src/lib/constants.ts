export const themes = ["light", "dark", "system"] as const;

export const lightApplicationThemes = [
  "light",
  "paper-light",
  "linen-light",
  "sage-light",
  "mist-light",
  "lavender-light",
  "rosewater-light",
  "sand-light",
  "lagoon-light",
  "peach-light",
] as const;
export const darkApplicationThemes = [
  "dark",
  "nord-dark",
  "rose-pine-dark",
  "mocha-dark",
  "forest-dark",
  "deep-sea-dark",
  "graphite-dark",
  "aubergine-dark",
  "espresso-dark",
  "midnight-dark",
] as const;
export const applicationThemes = [
  "system",
  ...lightApplicationThemes,
  ...darkApplicationThemes,
] as const;
