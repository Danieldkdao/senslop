import type { LanguageModelMiddleware } from "ai";
import { AiOutputLimitError, AiServiceError, AiTransientError } from "./errors";

type MiddlewareCall = Parameters<
  NonNullable<LanguageModelMiddleware["wrapGenerate"]>
>[0];
type ModelStream = Awaited<ReturnType<MiddlewareCall["doStream"]>>;
type ModelResult = Awaited<ReturnType<MiddlewareCall["doGenerate"]>>;

export const assertModelCompletion = (
  finishReason: ModelResult["finishReason"],
) => {
  if (
    finishReason.unified === "content-filter" ||
    finishReason.raw === "refusal"
  )
    throw new AiServiceError(
      "The provider blocked this response. Try rephrasing the request or choose another model.",
    );
  switch (finishReason.unified) {
    case "stop":
    case "tool-calls":
      return;
    case "length":
      throw new AiOutputLimitError();
    default:
      throw new AiTransientError(
        "The provider response did not complete. Retry when ready.",
      );
  }
};

export const requireCompletedModelResult = (
  result: ModelResult,
): ModelResult => {
  assertModelCompletion(result.finishReason);
  return result;
};

export const requireCompletedModelStream = (
  result: ModelStream,
): ModelStream => ({
  ...result,
  stream: result.stream.pipeThrough(
    new TransformStream({
      transform(part, controller) {
        if (part.type === "finish") assertModelCompletion(part.finishReason);
        controller.enqueue(part);
      },
    }),
  ),
});

export const collectModelStream = async (
  result: ModelStream,
): Promise<ModelResult> => {
  const content: ModelResult["content"] = [];
  const text = new Map<
    string,
    Extract<ModelResult["content"][number], { type: "text" | "reasoning" }>
  >();
  let usage: ModelResult["usage"] | undefined;
  let finishReason: ModelResult["finishReason"] | undefined;
  let warnings: ModelResult["warnings"] = [];
  let providerMetadata: ModelResult["providerMetadata"];
  let response: ModelResult["response"] = result.response;
  let characters = 0;
  const reader = requireCompletedModelStream(result).stream.getReader();
  try {
    while (true) {
      const { value: part, done } = await reader.read();
      if (done) break;
      switch (part.type) {
        case "stream-start":
          warnings = part.warnings;
          break;
        case "response-metadata":
          response = {
            ...response,
            id: part.id,
            modelId: part.modelId,
            timestamp: part.timestamp,
          };
          break;
        case "text-start":
        case "reasoning-start": {
          const entry = {
            type:
              part.type === "text-start"
                ? ("text" as const)
                : ("reasoning" as const),
            text: "",
            providerMetadata: part.providerMetadata,
          };
          text.set(part.id, entry);
          content.push(entry);
          break;
        }
        case "text-delta":
        case "reasoning-delta": {
          const entry = text.get(part.id);
          if (entry) entry.text += part.delta;
          characters += part.delta.length;
          if (characters > 1000000)
            throw new AiServiceError("Response size limit reached.");
          break;
        }
        case "text-end":
        case "reasoning-end": {
          const entry = text.get(part.id);
          if (entry && part.providerMetadata)
            entry.providerMetadata = {
              ...entry.providerMetadata,
              ...part.providerMetadata,
            };
          break;
        }
        case "tool-call":
        case "tool-result":
        case "source":
        case "file":
        case "tool-approval-request":
          content.push(part);
          break;
        case "finish":
          usage = part.usage;
          finishReason = part.finishReason;
          providerMetadata = part.providerMetadata;
          break;
        case "error":
          throw part.error;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!usage || !finishReason)
    throw new AiServiceError(
      "The provider stream ended before completion. Retry when ready.",
      502,
    );
  return {
    content,
    usage,
    finishReason,
    warnings,
    providerMetadata,
    response,
    request: result.request,
  };
};
