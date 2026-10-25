import type { AiSettingsPatchSchema, AiSettingsSchema } from "../schemas";

export const mergeAiSettings = (
  settings: AiSettingsSchema,
  patch: AiSettingsPatchSchema,
): AiSettingsSchema => ({
  ...settings,
  ...patch,
  capacity: { ...settings.capacity, ...patch.capacity },
  roles: { ...settings.roles, ...patch.roles },
});
