import type { SavedReviewSchema } from "@senslop/contracts";
import type { z } from "zod";
import type { GroupingSchema } from "../../features/agents/schemas";

export type SnapshotChange = Pick<
  SavedReviewSchema["files"][number],
  "path" | "oldPath" | "binary" | "diff"
> & {
  offset?: number;
  total?: number;
};

export type AnalysisCheckpoint = {
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
};

export type AnalysisExecutionPolicy = {
  groupingInputTokens: number;
  groupingMaxFiles: number;
  groupingOutputTokens: number;
  groupingSteps: number;
  batchConcurrency: number;
};

export type AiRequestState = { contextCalls: number; requestId?: string };

export type ProviderRequestLimits = {
  inputTokensPerMinute?: number;
  outputTokensPerMinute?: number;
  requestsPerMinute?: number;
};

export type RequestCapacity = {
  concurrency: number;
  limits: ProviderRequestLimits;
};

export type RequestReservation = {
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
};

export type RequestBudget<T> = {
  inputTokens?: number;
  outputTokens?: number;
  capacity?: RequestCapacity;
  actualInputTokens?: (result: T) => number | undefined;
  actualOutputTokens?: (result: T) => number | undefined;
};

export type RequestLimiter = {
  run: <T>(
    operation: () => PromiseLike<T>,
    signal?: AbortSignal,
    budget?: RequestBudget<T>,
  ) => Promise<T>;
  runStream: <T extends { stream: ReadableStream<unknown> }>(
    operation: () => PromiseLike<T>,
    signal?: AbortSignal,
    budget?: RequestBudget<unknown>,
  ) => Promise<T>;
  state: () => { concurrency: number; active: number; queued: number };
  subscribe: (listener: () => void) => () => void;
  registerDemand: (pending: () => number) => () => void;
};

export type AnalysisRepairIssue = {
  target: string;
  field: string;
  message: string;
  observed?: unknown;
  expected?: unknown;
};
export type AnalysisRepairOptions = {
  snapshot: SavedReviewSchema;
  members: string[];
  changes: SnapshotChange[];
  context: string;
  signal: AbortSignal;
  generate: (
    schema: z.ZodType,
    prompt: string,
    task: string,
  ) => Promise<unknown>;
  onRepair?: (issues: AnalysisRepairIssue[], attempt: number) => void;
  preparedFiles?: GroupingSchema["groups"][number]["files"];
};

export type AiDiagnosticContext = {
  snapshotId: string;
  jobId?: string;
  runId?: string;
  provider?: string;
  modelId?: string;
  task?: string;
  parentRequestId?: string;
};

export type AiRequestDiagnosticSettings = {
  contextWindow: number;
  maxOutputTokens: number;
  maxSteps: number;
  maxRetries: number;
  timeoutMs: number;
  responseFormat: "text" | "structured-output";
  promptCharacters: number;
  toolNames: string[];
};

export type AiResponseDiagnosticInput = {
  id?: string;
  modelId?: string;
  headers?: Record<string, string>;
};

export type AiStepDiagnosticInput = {
  stepNumber: number;
  finishReason: string;
  text: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    outputTokenDetails: { reasoningTokens?: number };
  };
  toolCalls: readonly ({ toolName: string; invalid?: boolean } | undefined)[];
  content: readonly { type: string }[];
  response: AiResponseDiagnosticInput;
  warnings?: readonly { type: string }[];
};
