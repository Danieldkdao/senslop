import type { ReactNode } from "react";

export type SettingsScreen = { id: string; label: string; content: ReactNode };
export type SettingsSection = {
  id: string;
  label: string;
  keywords: string;
  visible?: boolean;
  content: ReactNode;
  links?: { id: string; label: string }[];
};
export type SettingsNavigation = {
  navigate: (screen: SettingsScreen) => void;
  back: () => void;
};
