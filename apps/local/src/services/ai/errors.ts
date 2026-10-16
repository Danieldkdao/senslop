import { RetryError } from "ai";
import { ZodError } from "zod";

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

export class AiOutputLimitError extends AiServiceError {
  constructor() {
    super(
      "The model exhausted its completion budget before returning a complete result.",
    );
    this.name = "AiOutputLimitError";
  }
}

export class AiGroupingRepairError extends AiServiceError {
  constructor(message: string) {
    super(message);
    this.name = "AiGroupingRepairError";
  }
}

export class AiReviewRepairError extends AiServiceError {
  constructor(message: string) {
    super(message);
    this.name = "AiReviewRepairError";
  }
}

export class AiStructuredOutputError extends AiServiceError {
  constructor(message: string) {
    super(message);
    this.name = "AiStructuredOutputError";
  }
}

export class AiTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransientError";
  }
}

export const getAiErrorStatus = (error: unknown, depth = 0): number | null => {
  if (depth > 5) return null;
  if (RetryError.isInstance(error))
    return getAiErrorStatus(error.lastError, depth + 1);
  if (!error || typeof error !== "object" || !("statusCode" in error))
    return error && typeof error === "object" && "cause" in error
      ? getAiErrorStatus(error.cause, depth + 1)
      : null;
  const status = error.statusCode;
  if (status === 200 && "data" in error) {
    const data = error.data;
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      typeof data.code === "number" &&
      Number.isInteger(data.code) &&
      data.code >= 400 &&
      data.code <= 599
    )
      return data.code;
  }
  return typeof status === "number" ? status : null;
};

export const isAiSchemaComplexityError = (error: unknown): boolean => {
  if (getAiErrorStatus(error) !== 400) return false;
  let current = error;
  for (let depth = 0; current instanceof Error && depth < 6; depth++) {
    if (
      /\bschema\b|response[_ -]?format|responseJsonSchema/i.test(
        current.message,
      ) &&
      /too many states|too complex|complexity|(?:exceeds?|maximum)[\s\S]{0,60}(?:nesting|depth)/i.test(
        current.message,
      )
    )
      return true;
    current = RetryError.isInstance(current)
      ? current.lastError
      : current.cause;
  }
  return false;
};

export const isRetryableAiError = (error: unknown): boolean => {
  if (RetryError.isInstance(error)) return isRetryableAiError(error.lastError);
  if (error instanceof AiTransientError) return true;
  const status = getAiErrorStatus(error);
  if (status !== null)
    return [408, 409, 429].includes(status) || (status >= 500 && status <= 599);
  return (
    !!error &&
    typeof error === "object" &&
    "isRetryable" in error &&
    error.isRetryable === true
  );
};

export const getAiProviderBackoff = (error: unknown) => {
  const status = getAiErrorStatus(error);
  const messages: string[] = [];
  let retryAfterMs: number | undefined;
  let limitKind: unknown;
  const appendHint = (value: unknown) => {
    const nested =
      value && typeof value === "object" && "error" in value
        ? value.error
        : undefined;
    for (const candidate of [value, nested]) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Record<string, unknown>;
      if (Array.isArray(record.details)) {
        for (const detail of record.details) {
          if (
            !detail ||
            typeof detail !== "object" ||
            detail["@type"] !== "type.googleapis.com/google.rpc.RetryInfo" ||
            typeof detail.retryDelay !== "string"
          )
            continue;
          const seconds = detail.retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
          if (seconds)
            retryAfterMs = Math.max(
              retryAfterMs ?? 0,
              Math.min(Number(seconds[1]) * 1000, 3600000),
            );
        }
      }
      for (const field of ["message", "code", "type"] as const) {
        const hint = record[field];
        if (typeof hint === "string") messages.push(hint.slice(0, 4096));
      }
    }
  };
  let current = error;
  for (
    let depth = 0;
    current && typeof current === "object" && depth < 6;
    depth++
  ) {
    if ("message" in current && typeof current.message === "string")
      messages.push(current.message.slice(0, 4096));
    if ("data" in current) appendHint(current.data);
    if (
      "responseBody" in current &&
      typeof current.responseBody === "string" &&
      current.responseBody.length <= 8192
    ) {
      try {
        appendHint(JSON.parse(current.responseBody));
      } catch {
        /* Non-JSON provider errors use their message above. */
      }
    }
    if (
      "data" in current &&
      current.data &&
      typeof current.data === "object" &&
      "limitKind" in current.data
    )
      limitKind = current.data.limitKind;
    if (
      "responseHeaders" in current &&
      current.responseHeaders &&
      typeof current.responseHeaders === "object"
    ) {
      const headers = new Headers(
        current.responseHeaders as Record<string, string>,
      );
      const milliseconds = headers.get("retry-after-ms");
      const seconds = headers.get("retry-after");
      const delay =
        milliseconds !== null
          ? Number(milliseconds)
          : seconds !== null
            ? /^\s*\d+(?:\.\d+)?\s*$/.test(seconds)
              ? Number(seconds) * 1000
              : Date.parse(seconds) - Date.now()
            : undefined;
      if (delay !== undefined && Number.isFinite(delay) && delay >= 0)
        retryAfterMs = Math.max(retryAfterMs ?? 0, Math.min(delay, 3600000));
    }
    current = RetryError.isInstance(current)
      ? current.lastError
      : "cause" in current
        ? current.cause
        : null;
  }
  const hints = messages.join("\n");
  const concurrency =
    limitKind === "concurrency" ||
    [
      /(?:concurrency|concurrent[\s_-]+requests?)[\s\S]{0,80}(?:limit|exceed|too many)/i,
      /(?:too[\s_-]+many|maximum|max)[\s_-]+(?:concurrent|simultaneous|parallel|active)[\s_-]+requests?/i,
      /(?:limit|exceed)[\s\S]{0,80}(?:concurrency|concurrent[\s_-]+requests?)/i,
      /requests?[\s_-]+in[\s_-]+flight[\s\S]{0,80}(?:limit|exceed)/i,
    ].some((pattern) => pattern.test(hints));
  if (
    concurrency &&
    (status === null ||
      [400, 409, 422, 429].includes(status) ||
      (status >= 500 && status <= 599))
  )
    return { kind: "concurrency" as const, retryAfterMs: retryAfterMs ?? 250 };
  if (status === 429)
    return { kind: "rate" as const, retryAfterMs: retryAfterMs ?? 1000 };
  if (status !== null && status >= 500 && status <= 599)
    return { kind: "unavailable" as const, retryAfterMs: retryAfterMs ?? 1000 };
  return null;
};

export const formatAiError = (error: unknown) => {
  if (error instanceof ZodError)
    return "The analysis result was invalid and could not be saved. Retry analysis or choose another model.";
  if (
    error instanceof AiServiceError ||
    (error instanceof Error &&
      ["NonRetriableError", "AiTransientError"].includes(error.name))
  )
    return error.message;
  if (
    error instanceof Error &&
    ["AbortError", "TimeoutError"].includes(error.name)
  )
    return "The provider request timed out or was canceled. Retry when ready.";
  const status = getAiErrorStatus(error);
  if (isAiSchemaComplexityError(error))
    return "The provider rejected the response schema as too complex. Retry with a smaller review or choose another model.";
  if (status !== null && status >= 500 && status <= 599)
    return "The model provider is temporarily unavailable. Try again later or choose another model.";
  if (status === 401 || status === 403)
    return "Provider rejected the credentials or model access. Update the key in Configure and retry.";
  if (status === 429)
    return "Provider rate limit or credit limit reached. Check your provider account and retry later.";
  if (status === 404)
    return "The selected model or endpoint is unavailable. Refresh models or check Configure.";
  return "The provider request failed. Check the model, endpoint, and provider account, then retry.";
};

export const isFatalAiError = (error: unknown) => {
  if (error instanceof AiServiceError || error instanceof ZodError) return true;
  const status = getAiErrorStatus(error);
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 422 ||
    (error instanceof Error &&
      /(?:unsupported|not supported|API key|Connection not found|credential store|model context budget)/i.test(
        error.message,
      ))
  );
};
