import { z } from "zod";
import { publicConnectionSchema } from "@senslop/contracts";

export const providerSettingsSchema = z.object({
  connections: z.array(publicConnectionSchema),
  defaultId: z.uuid().nullable(),
  cleanupPending: z.boolean(),
});
export type ProviderSettingsSchema = z.infer<typeof providerSettingsSchema>;

export const readProviderSettings =
  async (): Promise<ProviderSettingsSchema | null> => {
    try {
      const response = await fetch("/api/providers", { cache: "no-store" });
      if (!response.ok) return null;
      return providerSettingsSchema.parse(await response.json());
    } catch {
      return null;
    }
  };

export const providerRequest = async <T>(body: object): Promise<T> => {
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
