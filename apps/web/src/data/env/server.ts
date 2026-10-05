import { createEnv } from "@t3-oss/env-core";
import { serverEnv as databaseEnv } from "@senslop/database/env";
import { z } from "zod";

export const serverEnv = createEnv({
  extends: [databaseEnv],
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    MAILJET_API_KEY: z.string().min(1),
    MAILJET_API_SECRET: z.string().min(1),
    SENDER_EMAIL: z.email().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    TRIGGER_SECRET_KEY: z.string().min(1),
    TRIGGER_PROJECT_REF: z.string().min(1),
    CONNECTION_URL: z.url(),
    CONNECTION_INTERNAL_SECRET: z.string().min(32),
    CONNECTION_INTERNAL_URL: z.url().optional(),
  },
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    MAILJET_API_KEY: process.env.MAILJET_API_KEY,
    MAILJET_API_SECRET: process.env.MAILJET_API_SECRET,
    SENDER_EMAIL: process.env.SENDER_EMAIL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
    CONNECTION_URL: process.env.CONNECTION_URL,
    CONNECTION_INTERNAL_SECRET: process.env.CONNECTION_INTERNAL_SECRET,
    CONNECTION_INTERNAL_URL: process.env.CONNECTION_INTERNAL_URL,
  },
  emptyStringAsUndefined: true,
});
