import { PROTOCOL_VERSION } from "@senslop/contracts";

export const requestJSON = async <T>(
  baseURL: string,
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(new URL(path, baseURL), {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(15000),
    redirect: "error",
  });
  const data: unknown = await response.json().catch(() => null);
  const problem =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (!response.ok) {
    const error = new Error(
      (typeof problem.message === "string" ? problem.message : undefined) ||
        (typeof problem.error_description === "string"
          ? problem.error_description
          : undefined) ||
        "Service request failed. Check configuration and try again.",
    ) as Error & {
      code?: string;
      status?: number;
    };
    error.code =
      typeof problem.error === "string"
        ? problem.error
        : typeof problem.code === "string"
          ? problem.code
          : undefined;
    error.status = response.status;
    throw error;
  }
  return data as T;
};

export const validatedSocketURL = (value: string) => {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Invalid connection URL from server.");
  if (
    url.protocol !== "wss:" &&
    !(
      url.protocol === "ws:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error(
      "The connection service must use WSS, except for localhost.",
    );
  url.searchParams.set("protocolVersion", String(PROTOCOL_VERSION));
  return url;
};
