import { serverEnv } from "@/data/env/server";

export const apiError = (
  code: string,
  message: string,
  status: number,
  retryable = false,
) => {
  return Response.json(
    { code, message, retryable, details: null },
    { status, headers: { "Cache-Control": "no-store" } },
  );
};
export const serviceUnavailable = () => {
  return apiError(
    "SERVICE_UNAVAILABLE",
    "Account services are unavailable. Check local service configuration and database connectivity.",
    503,
    true,
  );
};
export const websocketURL = () => {
  const value = serverEnv.CONNECTION_URL;
  if (!value) throw new Error("Missing CONNECTION_URL.");
  const url = new URL(value);
  if (
    url.protocol !== "wss:" &&
    !(
      url.protocol === "ws:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Connection URL must use WSS outside localhost.");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Connection URL must not contain credentials or query data.",
    );
  url.pathname = "/connection";
  return url.toString();
};
