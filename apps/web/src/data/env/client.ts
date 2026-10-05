import { createEnv } from "@t3-oss/env-core";

export const clientEnv = createEnv({
  clientPrefix: "NEXT_PUBLIC_",
  client: {},
  runtimeEnv: {},
});
