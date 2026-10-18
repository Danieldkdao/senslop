import { createHash, randomUUID } from "node:crypto";
import { APICallError, RetryError, ToolChoiceViolationError } from "ai";
import {
  getAiErrorStatus,
  isRetryableAiError,
  isAiSchemaComplexityError,
  isAiSchemaValidationError,
} from "./errors";
import type {
  AiDiagnosticContext,
  AiRequestDiagnosticSettings,
  AiResponseDiagnosticInput,
  AiStepDiagnosticInput,
} from "./types";

const diagnosticIdentifier = (value: string | undefined) =>
  value && /^[a-zA-Z0-9._:/-]{1,128}$/.test(value) ? value : undefined;

export const getProviderResponseDiagnostics = (
  response: AiResponseDiagnosticInput,
) => ({
  responseId: diagnosticIdentifier(response.id),
  responseModelId: diagnosticIdentifier(response.modelId),
  providerRequestIds: Object.fromEntries(
    Object.entries(response.headers ?? {}).flatMap(([name, value]) => {
      const header = name.toLowerCase();
      const identifier = diagnosticIdentifier(value);
      return identifier &&
        ["request-id", "x-request-id", "x-generation-id"].includes(header)
        ? [[header, identifier]]
        : [];
    }),
  ),
});

const getJsonErrorKind = (message: string) => {
  if (/^Unexpected end|^Unterminated/i.test(message)) return "unexpected-end";
  if (
    /^Expected property name|^Expected double-quoted property|^Expected ':' after property/i.test(
      message,
    )
  )
    return "invalid-property";
  if (
    /^Bad (?:control character|escaped character)|^Invalid Unicode/i.test(
      message,
    )
  )
    return "invalid-string";
  if (/^Unexpected token|^Unexpected non-whitespace/i.test(message))
    return "unexpected-token";
  return "invalid-json";
};

export const getAiTextDiagnostics = (text: string, parseError?: unknown) => {
  const trimmed = text.trim();
  const shape = !trimmed
    ? "empty"
    : /^```json(?:\s|$)/i.test(trimmed)
      ? "json-fence"
      : trimmed.startsWith("```")
        ? "code-fence"
        : /^<(?:!doctype\s+html|html|head|body)(?:\s|>)/i.test(trimmed)
          ? "html"
          : trimmed.startsWith("{")
            ? "json-object"
            : trimmed.startsWith("[")
              ? "json-array"
              : "text";
  // JSON parser messages can quote source; retain only fixed categories and locations.
  const message = parseError instanceof SyntaxError ? parseError.message : "";
  const location = message.match(
    /at position (\d+)(?: \(line (\d+) column (\d+)\))?\s*$/,
  );
  return {
    shape,
    characters: text.length,
    fingerprint: createHash("sha256").update(text).digest("hex"),
    hasClosingFence: trimmed.endsWith("```"),
    hasClosingJsonDelimiter: /[}\]]$/.test(trimmed),
    refusalLanguageDetected:
      /\b(?:I (?:cannot|can't|am unable to)|unable to comply|cannot fulfill)\b/i.test(
        trimmed,
      ),
    jsonError: parseError
      ? {
          kind: getJsonErrorKind(message),
          position: location ? Number(location[1]) : undefined,
          line: location?.[2] ? Number(location[2]) : undefined,
          column: location?.[3] ? Number(location[3]) : undefined,
        }
      : undefined,
  };
};

const getErrorName = (error: unknown): string => {
  if (RetryError.isInstance(error)) return "RetryError";
  if (APICallError.isInstance(error)) return "APICallError";
  if (ToolChoiceViolationError.isInstance(error))
    return "ToolChoiceViolationError";
  if (!(error instanceof Error)) return "unknown";
  switch (error.name) {
    case "AiServiceError":
    case "AiOutputLimitError":
    case "AiTransientError":
    case "AbortError":
    case "TimeoutError":
    case "NonRetriableError":
    case "SyntaxError":
    case "TypeError":
      return error.name;
    default:
      return "Error";
  }
};

export const getAiErrorDiagnostics = (error: unknown) => {
  const retry = RetryError.isInstance(error) ? error : undefined;
  const lastError = retry?.lastError ?? error;
  return {
    errorName: getErrorName(error),
    lastErrorName: retry ? getErrorName(lastError) : undefined,
    statusCode: getAiErrorStatus(error),
    retryable: isRetryableAiError(error),
    schemaComplexity: isAiSchemaComplexityError(error),
    schemaRejected: isAiSchemaValidationError(error),
    providerAttempts: retry?.errors.length,
    retryReason: retry?.reason,
    ...(APICallError.isInstance(lastError)
      ? getProviderResponseDiagnostics({ headers: lastError.responseHeaders })
      : {}),
  };
};

export const createAiRequestLogger = (
  context: AiDiagnosticContext,
  settings: AiRequestDiagnosticSettings,
) => {
  const startedAt = performance.now();
  const details = { ...context, requestId: randomUUID() };
  const elapsedMs = () => Math.round(performance.now() - startedAt);
  const info = (event: string, metadata: Record<string, unknown> = {}) =>
    console.info("[senslop:ai-request]", {
      ...details,
      event,
      durationMs: elapsedMs(),
      ...metadata,
    });
  info("started", settings);
  return {
    context: details,
    elapsedMs,
    info,
    stepCompleted: (step: AiStepDiagnosticInput) =>
      info("step-completed", {
        step: step.stepNumber + 1,
        finishReason: step.finishReason,
        inputTokens: step.usage.inputTokens,
        outputTokens: step.usage.outputTokens,
        reasoningTokens: step.usage.outputTokenDetails.reasoningTokens,
        textCharacters: step.text.length,
        toolCalls: step.toolCalls
          .filter((call) => call !== undefined)
          .slice(0, 32)
          .map((call) => ({
            name: settings.toolNames.includes(call.toolName)
              ? call.toolName
              : "unknown",
            invalid: !!call.invalid,
          })),
        toolErrorCount: step.content.filter(
          (part) => part.type === "tool-error",
        ).length,
        warningTypes: step.warnings
          ?.slice(0, 16)
          .map((warning) => warning.type),
        ...getProviderResponseDiagnostics(step.response),
      }),
    failed: (error: unknown) =>
      console.warn("[senslop:ai-request]", {
        ...details,
        event: "failed",
        durationMs: elapsedMs(),
        ...getAiErrorDiagnostics(error),
      }),
  };
};
