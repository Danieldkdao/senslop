import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    SENSLOP_LOCAL_ORIGIN: z.url().optional(),
    SENSLOP_LOCAL_TOKEN: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    SENSLOP_LOCAL_SNAPSHOT: z.string().optional(),
    SENSLOP_LOCAL_REPOSITORY: z.string().optional(),
    SENSLOP_LOCAL_DATABASE: z.string().optional(),
  },
  runtimeEnv: {
    SENSLOP_LOCAL_ORIGIN: process.env.SENSLOP_LOCAL_ORIGIN,
    SENSLOP_LOCAL_TOKEN: process.env.SENSLOP_LOCAL_TOKEN,
    SENSLOP_LOCAL_SNAPSHOT: process.env.SENSLOP_LOCAL_SNAPSHOT,
    SENSLOP_LOCAL_REPOSITORY: process.env.SENSLOP_LOCAL_REPOSITORY,
    SENSLOP_LOCAL_DATABASE: process.env.SENSLOP_LOCAL_DATABASE,
  },
  emptyStringAsUndefined: true,
});
