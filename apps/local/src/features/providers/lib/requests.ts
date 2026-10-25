import { trackSettingsSave } from "../../settings/lib/settings-save-store";
import { z } from "zod";
import { publicConnectionSchema } from "@senslop/contracts";

export const providerSettingsSchema = z.object({
  connections: z.array(publicConnectionSchema),
  defaultId: z.uuid().nullable(),
  cleanupPending: z.boolean(),
});
export type ProviderSettingsSchema = z.infer<typeof providerSettingsSchema>;

export const readProviderSettings = async (
  signal?: AbortSignal,
): Promise<ProviderSettingsSchema | null> => {
  try {
    const response = await fetch("/api/providers", {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return null;
    return providerSettingsSchema.parse(await response.json());
  } catch {
    return null;
  }
};

export const providerRequest = async <T>(body: object): Promise<T> => {
  const execute = async () => {
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        (data as { message?: string }).message ??
          "Local provider settings are unavailable. Retry.",
      );
    return data as T;
  };
  return "action" in body &&
    ["save", "default", "delete", "cleanup"].includes(String(body.action))
    ? trackSettingsSave("provider-settings", execute)
    : execute();
};
