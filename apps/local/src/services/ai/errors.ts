export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

export const formatAiError = (error: unknown) => {
  if (error instanceof AiServiceError) return error.message;
  if (
    error instanceof Error &&
    ["AbortError", "TimeoutError"].includes(error.name)
  )
    return "The provider request timed out or was canceled. Retry when ready.";
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : null;
  if (status === 401 || status === 403)
    return "Provider rejected the credentials or model access. Update the key in Configure and retry.";
  if (status === 429)
    return "Provider rate limit or credit limit reached. Check your provider account and retry later.";
  if (status === 404)
    return "The selected model or endpoint is unavailable. Refresh models or check Configure.";
  return "The provider request failed. Check the model, endpoint, and provider account, then retry.";
};
