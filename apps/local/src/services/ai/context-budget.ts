import { z } from "zod";
import { AiContextBudgetError } from "./errors";

// Tokenizers differ by model; combine this estimate with 20% context headroom.
export const estimateTokens = (value: unknown) =>
  Math.ceil(Buffer.byteLength(JSON.stringify(value)) / 3);

// Reserve conservatively before admission; reconcile with provider usage after completion.
export const estimateInputTokenUpperBound = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value)) + 256;

export const schemaTokens = (schema: z.ZodType) =>
  estimateTokens(z.toJSONSchema(schema));

export const assertContextBudget = (
  inputTokens: number,
  limit: number,
  outputTokens: number,
) => {
  if (inputTokens + outputTokens > Math.floor(limit * 0.8))
    throw new AiContextBudgetError(
      `Estimated request input (${inputTokens.toLocaleString()} tokens) plus ${outputTokens.toLocaleString()} output tokens exceeds the safe budget for the configured ${limit.toLocaleString()}-token context window. This is a local estimate, not a provider rejection. Reduce the request or configure the model's actual context window.`,
    );
};

export const getBatchTokenBudget = (
  inputTokens: number,
  limit: number,
  outputTokens: number,
) => {
  assertContextBudget(inputTokens + 1, limit, outputTokens);
  // Bound diff data independently; shared context must use the real model budget.
  return Math.floor(limit * 0.8) - inputTokens - outputTokens;
};
