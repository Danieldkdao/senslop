import type { ReactNode } from "react";

export type SettingsScreen = {
  id: string;
  label: string;
  content: ReactNode;
  headerActions?: ReactNode;
};
export type SettingsSection = {
  id: string;
  label: string;
  keywords: string;
  visible?: boolean;
  content: ReactNode;
  headerActions?: ReactNode;
  links?: { id: string; label: string; onSelect?: () => void }[];
};
export type SettingsNavigation = {
  navigate: (screen: SettingsScreen) => void;
  back: () => void;
};

export type SettingsSaveStatus =
  (typeof import("./constants").settingsSaveStatuses)[number];
export type SettingsSaveSnapshot = {
  status: SettingsSaveStatus;
  message?: string;
};
