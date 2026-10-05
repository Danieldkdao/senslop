import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    LOCALAPPDATA: z.string().optional(),
    XDG_CONFIG_HOME: z.string().optional(),
  },
  runtimeEnv: {
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  },
  emptyStringAsUndefined: true,
});
