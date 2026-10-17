import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    SENSLOP_DATA_DIRECTORY: z.string().optional(),
    LOCALAPPDATA: z.string().optional(),
    XDG_CONFIG_HOME: z.string().optional(),
    XDG_DATA_HOME: z.string().optional(),
  },
  runtimeEnv: {
    SENSLOP_DATA_DIRECTORY: process.env.SENSLOP_DATA_DIRECTORY,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  },
  emptyStringAsUndefined: true,
});
