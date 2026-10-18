import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const nodeEnvironments = ["development", "production", "test"] as const;
export type NodeEnvironment = (typeof nodeEnvironments)[number];

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z.enum(nodeEnvironments).default("development"),
    INNGEST_BASE_URL: z.url().optional(),
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    SENSLOP_INNGEST_APP_ID: z.string().optional(),
    SENSLOP_LOCAL_STARTED_AT: z.iso.datetime().optional(),
    SENSLOP_LOCAL_ORIGIN: z.url().optional(),
    SENSLOP_LOCAL_WORKER_TOKEN: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    SENSLOP_LOCAL_TOKEN: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    SENSLOP_LOCAL_SNAPSHOT: z.string().optional(),
    SENSLOP_LOCAL_REPOSITORY: z.string().optional(),
    SENSLOP_LOCAL_DATABASE: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    INNGEST_BASE_URL: process.env.INNGEST_BASE_URL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    SENSLOP_INNGEST_APP_ID: process.env.SENSLOP_INNGEST_APP_ID,
    SENSLOP_LOCAL_STARTED_AT: process.env.SENSLOP_LOCAL_STARTED_AT,
    SENSLOP_LOCAL_ORIGIN: process.env.SENSLOP_LOCAL_ORIGIN,
    SENSLOP_LOCAL_WORKER_TOKEN: process.env.SENSLOP_LOCAL_WORKER_TOKEN,
    SENSLOP_LOCAL_TOKEN: process.env.SENSLOP_LOCAL_TOKEN,
    SENSLOP_LOCAL_SNAPSHOT: process.env.SENSLOP_LOCAL_SNAPSHOT,
    SENSLOP_LOCAL_REPOSITORY: process.env.SENSLOP_LOCAL_REPOSITORY,
    SENSLOP_LOCAL_DATABASE: process.env.SENSLOP_LOCAL_DATABASE,
  },
  emptyStringAsUndefined: true,
});

export const claudeSubscriptionEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: serverEnv.NODE_ENV };
  const allowed = [
    "HOME",
    "PATH",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "APPDATA",
    "LOCALAPPDATA",
    "COMSPEC",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "PATHEXT",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "CLAUDE_CONFIG_DIR",
  ];
  // Clear provider-inherited billing/backend variables before applying subscription-only settings.
  for (const name of Object.keys(process.env))
    if (/^(ANTHROPIC_|CLAUDE_|AWS_|GOOGLE_|GCLOUD_|CLOUD_ML_)/.test(name))
      environment[name] = undefined;
  for (const name of allowed) environment[name] = process.env[name];
  return environment;
};
