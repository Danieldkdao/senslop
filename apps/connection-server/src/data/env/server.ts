import { createEnv } from "@t3-oss/env-core";
import { serverEnv as databaseEnv } from "@senslop/database/env";
import { z } from "zod";

export const serverEnv = createEnv({
  extends: [databaseEnv],
  server: {
    BETTER_AUTH_URL: z.url(),
    CONNECTION_INTERNAL_SECRET: z.string().min(32),
    CONNECTION_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  },
  runtimeEnv: {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    CONNECTION_INTERNAL_SECRET: process.env.CONNECTION_INTERNAL_SECRET,
    CONNECTION_PORT: process.env.CONNECTION_PORT,
  },
  emptyStringAsUndefined: true,
});
