import type { AgentRole, AiSettingsSchema } from "../schemas";

export const assignedModel = (
  settings: Pick<AiSettingsSchema, "separate" | "roles" | "shared"> | undefined,
  role: AgentRole,
) => (settings?.separate ? settings.roles[role] : settings?.shared);
