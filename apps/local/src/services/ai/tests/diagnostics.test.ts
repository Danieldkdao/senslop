import { expect, test } from "vitest";
import { APICallError, RetryError } from "ai";
import {
  getAiErrorDiagnostics,
  getAiTextDiagnostics,
  getProviderResponseDiagnostics,
} from "../diagnostics";
import { formatAiError } from "../errors";

test.each([
  ["", "empty"],
  ['{"groups":', "json-object"],
  ["[]", "json-array"],
  ['```json\n{"groups":[]}\n```', "json-fence"],
  ["```typescript\nTEST_PRIVATE_SOURCE\n```", "code-fence"],
  ["<!DOCTYPE html><html>TEST_PRIVATE_SOURCE</html>", "html"],
  ["I cannot comply with this request. TEST_PRIVATE_SOURCE", "text"],
] as const)(
  "response shape is classified without exposing %s",
  (text, shape) => {
    const details = getAiTextDiagnostics(text);
    expect(details.shape).toBe(shape);
    expect(details.characters).toBe(text.length);
    expect(details.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(details).toEqual(getAiTextDiagnostics(text));
    expect(JSON.stringify(details)).not.toContain("TEST_PRIVATE");
  },
);

test("JSON diagnostics report parser location and bounded categories without echoing invalid text", () => {
  const text = '{"groups" TEST_PRIVATE_SOURCE}';
  let parseError: unknown;
  try {
    JSON.parse(text);
  } catch (error) {
    parseError = error;
  }
  const details = getAiTextDiagnostics(text, parseError);
  expect(details.jsonError).toEqual(
    expect.objectContaining({ kind: "invalid-property", position: 10 }),
  );
  expect(JSON.stringify(details)).not.toContain("TEST_PRIVATE");
  expect(
    getAiTextDiagnostics(
      '{"groups":',
      new SyntaxError("Unexpected end of JSON input"),
    ).jsonError,
  ).toMatchObject({ kind: "unexpected-end" });
});

test("provider metadata logs only bounded identifiers from allowed headers", () => {
  const details = getProviderResponseDiagnostics({
    id: "response-123",
    modelId: "codestral-2508",
    headers: {
      "X-Request-ID": "request-123",
      authorization: "Bearer TEST_PRIVATE_KEY",
      "set-cookie": "TEST_PRIVATE_COOKIE",
      "x-generation-id": "TEST_PRIVATE_SOURCE\n".repeat(100),
    },
  });
  expect(details).toEqual({
    responseId: "response-123",
    responseModelId: "codestral-2508",
    providerRequestIds: { "x-request-id": "request-123" },
  });
  expect(JSON.stringify(details)).not.toContain("TEST_PRIVATE");
});

test("request failures retain status and retry attempts without raw provider errors", () => {
  const error = new APICallError({
    message: "TEST_PRIVATE_PROVIDER_RESPONSE",
    url: "https://example.test/?key=TEST_PRIVATE_KEY",
    requestBodyValues: { source: "TEST_PRIVATE_SOURCE" },
    statusCode: 503,
    responseBody: "TEST_PRIVATE_RESPONSE_BODY",
    responseHeaders: { "x-request-id": "request-123" },
    isRetryable: true,
  });
  const details = getAiErrorDiagnostics(
    new RetryError({
      message: "TEST_PRIVATE_RETRY_ERROR",
      reason: "maxRetriesExceeded",
      errors: [error, error, error],
    }),
  );
  expect(details).toMatchObject({
    errorName: "RetryError",
    lastErrorName: "APICallError",
    statusCode: 503,
    retryable: true,
    providerAttempts: 3,
    providerRequestIds: { "x-request-id": "request-123" },
  });
  expect(JSON.stringify(details)).not.toContain("TEST_PRIVATE");
});

test("schema complexity failures expose a safe category and actionable message without provider text", () => {
  const error = new APICallError({
    message:
      "The specified schema produces a constraint that has too many states for serving. TEST_PRIVATE_SOURCE",
    url: "https://example.test/?key=TEST_PRIVATE_KEY",
    requestBodyValues: { source: "TEST_PRIVATE_SOURCE" },
    statusCode: 400,
    isRetryable: false,
  });
  const wrapped = new RetryError({
    message: "Failed",
    reason: "errorNotRetryable",
    errors: [error],
  });
  expect(getAiErrorDiagnostics(wrapped)).toMatchObject({
    statusCode: 400,
    schemaComplexity: true,
    retryable: false,
  });
  expect(formatAiError(wrapped)).toMatch(/schema.*complex/i);
  expect(JSON.stringify(getAiErrorDiagnostics(wrapped))).not.toContain(
    "TEST_PRIVATE",
  );
  expect(formatAiError(wrapped)).not.toContain("TEST_PRIVATE");
});
