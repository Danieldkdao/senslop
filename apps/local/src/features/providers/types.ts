import type { PublicConnectionSchema } from "@senslop/contracts";

export type ProviderSettingsState = {
  connections: PublicConnectionSchema[];
  defaultId: string | null;
  cleanupPending: boolean;
};
export type ConnectionProbe = {
  supported: boolean;
  models: string[];
  message: string;
};

export type ConnectionFeedback = {
  failed: boolean;
  message: string;
};
