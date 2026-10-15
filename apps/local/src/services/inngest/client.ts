import { Inngest } from "inngest";
import { serverEnv } from "../../data/env/server";

export const inngest = new Inngest({
  id: `senslop-${serverEnv.SENSLOP_INNGEST_APP_ID ?? "local"}`,
  isDev: false,
  baseUrl: serverEnv.INNGEST_BASE_URL ?? "http://127.0.0.1:8288",
  eventKey: serverEnv.INNGEST_EVENT_KEY ?? "not-configured",
  signingKey: serverEnv.INNGEST_SIGNING_KEY,
});
