import { uiPreferencesSchema } from "./schemas";

export const defaultUiPreferences = uiPreferencesSchema.parse({});

export const settingsSaveStatuses = [
  "idle",
  "waiting",
  "saving",
  "saved",
  "invalid",
  "error",
] as const;
