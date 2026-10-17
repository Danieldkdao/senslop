import { randomUUID } from "node:crypto";
import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { AiServiceError, formatAiError } from "./errors";

export const agentStreamResponse = <Tools extends ToolSet>(
  stream: ReadableStream<TextStreamPart<Tools>>,
  abort: AbortController,
  save?: (
    message: UIMessage,
    status: "complete" | "interrupted",
  ) => Promise<void>,
  messageId?: string,
) => {
  let length = 0;
  let hasText = false;
  let failed = false;
  const startedAt = Date.now();
  let thinkingEndedAt: number | undefined;
  let stepHasTools = false;
  const nativeTools = new Set<string>();
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            if (part.type === "start-step") {
              stepHasTools = false;
              nativeTools.clear();
              hasText = false;
              thinkingEndedAt = undefined;
            }
            if (part.type === "tool-call") {
              if (part.providerExecuted) nativeTools.add(part.toolCallId);
              else stepHasTools = true;
              hasText = false;
              thinkingEndedAt = undefined;
            }
            if (part.type === "tool-result" || part.type === "tool-error")
              nativeTools.delete(part.toolCallId);
            if (part.type === "text-delta") {
              if (!stepHasTools && !nativeTools.size && part.text.trim())
                thinkingEndedAt ??= Date.now();
              length += part.text.length;
              hasText ||= !!part.text.trim();
              if (length > 100000)
                throw new AiServiceError("Response size limit reached.");
            }
            if (part.type === "finish") {
              if (part.finishReason === "length")
                throw new AiServiceError(
                  "The model reached its response limit. Retry or choose another model.",
                );
              if (
                part.finishReason === "tool-calls" ||
                stepHasTools ||
                nativeTools.size
              )
                throw new AiServiceError(
                  "The agent stopped before its final answer. Retry when ready.",
                );
              if (!hasText)
                throw new AiServiceError(
                  "Response was empty. Retry when ready.",
                );
            }
            controller.enqueue(part);
          },
        }),
      ),
      generateMessageId: () => messageId ?? randomUUID(),
      sendReasoning: true,
      messageMetadata: ({ part }) => ({
        createdAt: new Date(startedAt).toISOString(),
        ...(part.type === "finish" || part.type === "abort"
          ? {
              thinkingDurationMs: Math.max(
                0,
                (thinkingEndedAt ?? Date.now()) - startedAt,
              ),
            }
          : {}),
      }),
      onError: (error) => {
        failed = true;
        return formatAiError(error);
      },
      onEnd: async ({ responseMessage, outcome, isAborted, isCancelled }) => {
        const complete =
          outcome.status === "completed" &&
          !failed &&
          !isAborted &&
          !isCancelled &&
          !abort.signal.aborted &&
          hasText;
        if (!complete) abort.abort();
        await save?.(responseMessage, complete ? "complete" : "interrupted");
      },
    }),
  });
};
