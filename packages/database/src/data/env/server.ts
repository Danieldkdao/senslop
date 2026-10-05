import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: { DATABASE_URL: z.url() },
  runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL },
  emptyStringAsUndefined: true,
});
