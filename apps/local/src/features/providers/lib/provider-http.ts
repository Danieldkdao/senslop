import type { ProviderId } from "@senslop/contracts";

export const readProviderJson = async (
  response: Response,
): Promise<unknown> => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error("Response too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
  }
};

export const readProviderAccessError = async (
  response: Response,
  provider: ProviderId,
): Promise<string | null> => {
  if (provider !== "grok" || response.status !== 403) return null;
  try {
    const payload = await readProviderJson(response);
    if (!payload || typeof payload !== "object" || !("error" in payload))
      return null;
    const error = payload.error;
    const message =
      typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? error.message
          : null;
    // xAI uses 403 for unfunded teams as well as denied credentials.
    if (
      typeof message === "string" &&
      /does(?:n't| not) have any credits or licenses/i.test(message)
    )
      return "xAI blocked model access because this team has no credits or licenses. Set up billing in the xAI Console, then retry.";
  } catch {
    return null;
  }
  return null;
};
