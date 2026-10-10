import { serverEnv } from "@/data/env/server";

export const GET = () =>
  new Response("ok", {
    headers: {
      "Cache-Control": "no-store",
      "X-Senslop-Session": serverEnv.SENSLOP_LOCAL_TOKEN ?? "",
    },
  });
