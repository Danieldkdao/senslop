import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    SENSLOP_DATABASE_BRANCH: z.literal("development"),
    DATABASE_URL_UNPOOLED: z.url(),
  },
  runtimeEnv: {
    SENSLOP_DATABASE_BRANCH: process.env.SENSLOP_DATABASE_BRANCH,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
  },
  emptyStringAsUndefined: true,
});
