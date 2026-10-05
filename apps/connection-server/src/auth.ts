import { cliStatusSchema } from "@senslop/contracts";
import type { Identity } from "./presence";

export const authenticateCLI = async (
  token: string,
  websiteOrigin: string,
): Promise<Identity | null> => {
  const response = await fetch(new URL("/api/cli/status", websiteOrigin), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (response.status === 401 || response.status === 403) return null;
  // Retry outages through the server's 1013 close path instead of reporting revocation.
  if (!response.ok) throw new Error("Account service unavailable");
  const status = cliStatusSchema.parse(await response.json());
  return {
    userId: status.user.id,
    sessionId: status.deviceId,
    deviceId: status.deviceId,
    name: status.deviceName,
  };
};
