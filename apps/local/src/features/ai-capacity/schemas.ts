import { z } from "zod";
import { capacityBounds } from "./constants";

const boundedNumber = (bounds: { min: number; max: number }) =>
  z.number().int().min(bounds.min).max(bounds.max);

export const connectionCapacitySchema = z.object({
  concurrency: boundedNumber(capacityBounds.concurrency),
  requestsPerMinute: boundedNumber(capacityBounds.requestsPerMinute).nullable(),
  inputTokensPerMinute: boundedNumber(
    capacityBounds.inputTokensPerMinute,
  ).nullable(),
  outputTokensPerMinute: boundedNumber(
    capacityBounds.outputTokensPerMinute,
  ).nullable(),
  contextTokens: boundedNumber(capacityBounds.contextTokens),
  outputTokens: boundedNumber(capacityBounds.outputTokens),
  groupingInputTokens: boundedNumber(capacityBounds.groupingInputTokens),
  reviewInputTokens: boundedNumber(capacityBounds.reviewInputTokens),
});
export type ConnectionCapacitySchema = z.infer<typeof connectionCapacitySchema>;

export const aiCapacitySchema = z.record(
  z.string().min(1).max(200),
  connectionCapacitySchema,
);
export type AiCapacitySchema = z.infer<typeof aiCapacitySchema>;
