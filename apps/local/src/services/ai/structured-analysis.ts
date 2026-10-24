import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type ModelMessage,
  type ToolLoopAgentSettings,
} from "ai";
import type { z } from "zod";
import type { createGroupingAgent } from "./analysis-agents";
import { AiOutputLimitError, AiStructuredOutputError } from "./errors";
import {
  createAiRequestLogger,
  getAiTextDiagnostics,
  getProviderResponseDiagnostics,
} from "./diagnostics";
import { estimateTokens, schemaTokens } from "./context-budget";
import type { AiDiagnosticContext } from "./types";

export const generateStructuredAnalysis = async ({
  agent,
  schema,
  prompt,
  signal,
  maxSteps,
  maxOutputTokens,
  providerOptions,
  contextWindow,
  diagnostics,
  prepareMessages,
  onRequest,
  onProgress,
  toolsEnabled = true,
}: {
  agent: ReturnType<typeof createGroupingAgent>;
  schema: z.ZodType;
  prompt: string;
  signal: AbortSignal;
  maxSteps: number;
  maxOutputTokens: number;
  providerOptions: ToolLoopAgentSettings["providerOptions"];
  contextWindow: number;
  diagnostics: AiDiagnosticContext;
  prepareMessages: (
    messages: ModelMessage[],
    instructions: unknown,
  ) => ModelMessage[];
  onRequest: (requestId?: string) => void;
  onProgress?: (message: string) => void;
  toolsEnabled?: boolean;
}): Promise<unknown> => {
  let preparedMessages: ModelMessage[] = [];
  let correctionMessages: ModelMessage[] | undefined;
  let parentRequestId: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const finalizing = attempt > 0;
    const logger = createAiRequestLogger(
      { ...diagnostics, parentRequestId },
      {
        contextWindow,
        maxOutputTokens,
        maxSteps: finalizing ? 1 : maxSteps,
        maxRetries: 2,
        timeoutMs: 480000,
        responseFormat: "structured-output",
        promptCharacters: finalizing ? 0 : prompt.length,
        toolNames: toolsEnabled && !finalizing ? Object.keys(agent.tools) : [],
      },
    );
    parentRequestId = logger.context.requestId;
    onRequest(logger.context.requestId);
    try {
      const result = await agent.generate({
        ...(correctionMessages ? { messages: correctionMessages } : { prompt }),
        abortSignal: signal,
        timeout: 480000,
        options: {
          schema,
          maxSteps: finalizing ? 1 : maxSteps,
          maxOutputTokens,
          providerOptions,
          toolsEnabled: toolsEnabled && !finalizing,
          prepareStep: ({ messages, instructions }) => {
            preparedMessages = prepareMessages(messages, instructions);
            return { messages: preparedMessages };
          },
        },
        onStepStart: ({
          stepNumber,
          instructions,
          messages,
          toolChoice,
          activeTools,
        }) =>
          logger.info("step-started", {
            agent: agent.id,
            resultAttempt: attempt + 1,
            phase: finalizing ? "format-repair" : "analysis",
            step: stepNumber + 1,
            toolChoice:
              typeof toolChoice === "string"
                ? toolChoice
                : (toolChoice?.type ?? "auto"),
            activeTools:
              activeTools ??
              (toolsEnabled && !finalizing ? Object.keys(agent.tools) : []),
            estimatedInputTokens:
              estimateTokens({ instructions, messages }) + schemaTokens(schema),
            resultSchemaTokens: schemaTokens(schema),
          }),
        onStepEnd: logger.stepCompleted,
      });
      if (result.finishReason === "length") throw new AiOutputLimitError();
      const output = result.output;
      logger.info("validated", {
        agent: agent.id,
        resultSource: "structured-output",
        resultAttempt: attempt + 1,
        steps: result.steps.length,
        ...getProviderResponseDiagnostics(result.finalStep.response),
      });
      return output;
    } catch (error) {
      let reasoningOnly = false;
      if (NoObjectGeneratedError.isInstance(error)) {
        if (error.finishReason === "length") {
          logger.info("output-limit", { agent: agent.id });
          throw new AiOutputLimitError();
        }
        const emptyResponse = !(error.text ?? "").trim();
        reasoningOnly =
          emptyResponse &&
          (error.usage?.outputTokenDetails.reasoningTokens ?? 0) > 0;
        let candidate: unknown;
        let parsed = false;
        try {
          candidate = JSON.parse(error.text ?? "");
          parsed = true;
        } catch {
          /* Incomplete JSON cannot preserve independently validated items. */
        }
        const validation = parsed ? schema.safeParse(candidate) : undefined;
        console.warn("[senslop:ai-result]", {
          ...logger.context,
          agent: agent.id,
          failureKind: reasoningOnly
            ? "reasoning-only"
            : emptyResponse
              ? "empty-response"
              : parsed
                ? "schema-mismatch"
                : "invalid-json",
          responseFormat: "structured-output",
          finishReason: error.finishReason,
          maxOutputTokens,
          inputTokens: error.usage?.inputTokens,
          outputTokens: error.usage?.outputTokens,
          reasoningTokens: error.usage?.outputTokenDetails.reasoningTokens,
          textDiagnostics: getAiTextDiagnostics(error.text ?? ""),
          issues:
            validation && !validation.success
              ? validation.error.issues.slice(0, 20).map((issue) => ({
                  code: issue.code,
                  path: issue.path,
                  message: issue.message,
                }))
              : [],
          recovery: parsed
            ? "targeted-item-repair"
            : finalizing
              ? "manual-retry"
              : "format-repair",
          ...getProviderResponseDiagnostics(error.response ?? {}),
        });
        // Preserve only complete candidates; the post-result checker validates each retained item.
        if (parsed) return candidate;
      } else if (!NoOutputGeneratedError.isInstance(error)) {
        logger.failed(error);
        throw error;
      }
      if (finalizing)
        throw new AiStructuredOutputError(
          reasoningOnly
            ? "The model server returned reasoning but no final answer after a format correction. Check the server's reasoning parser, chat template, and structured-output settings. This response does not establish whether the model supports structured output. Diagnostic details are available in the local server log."
            : "The model did not produce a complete structured result after a format correction. Check the model server's structured-output support and response settings. Diagnostic details are available in the local server log.",
        );
      onProgress?.("Correcting structured output format");
      logger.info("result-correction-requested", {
        agent: agent.id,
        failureKind: "structured-output",
      });
      correctionMessages = [
        ...preparedMessages,
        {
          role: "user",
          content:
            "The last response did not contain a complete JSON object matching the response schema. Source exploration is complete. Use the original batch and captured evidence already present, and return a complete structured result. Do not call tools, add Markdown, or invent evidence.",
        },
      ];
    } finally {
      onRequest(undefined);
    }
  }
  throw new AiStructuredOutputError("Structured output did not complete.");
};
