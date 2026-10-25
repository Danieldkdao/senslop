export const PROTOCOL_VERSION = 1;
export const CLI_CLIENT_ID = "senslop-cli";
export const HEARTBEAT_INTERVAL_MS = 15000;
export const HEARTBEAT_TIMEOUT_MS = 45000;
export const MAX_FILE_BYTES = 1048576;
export const MAX_SNAPSHOT_BYTES = 20 * MAX_FILE_BYTES;

export const reviewProfiles = [
  "correctness",
  "security",
  "performance",
  "accessibility",
  "api-compatibility",
  "migrations",
] as const;
