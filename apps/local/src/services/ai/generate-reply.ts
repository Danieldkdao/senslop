import "server-only";
import { generateText } from "ai";
import type { ProviderConfigSchema } from "@senslop/contracts";
import type { ChatMessageSchema } from "../../features/ai-test/schemas";
import { AiServiceError } from "./errors";
import { resolveLanguageModel } from "./provider-runtime";

export const generateReply = async (
  connection: ProviderConfigSchema,
  secret: string | null,
  modelId: string,
  messages: ChatMessageSchema[],
  signal: AbortSignal,
) => {
  const abortSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  abortSignal.throwIfAborted();
  const maxOutputTokens = connection.contextWindow
    ? Math.min(2048, Math.max(64, Math.floor(connection.contextWindow / 4)))
    : 2048;
  if (connection.contextWindow) {
    // One token per UTF-8 byte plus message overhead conservatively bounds local input.
    const inputBound = messages.reduce(
      (size, message) => size + Buffer.byteLength(message.content, "utf8") + 16,
      0,
    );
    if (inputBound + maxOutputTokens > connection.contextWindow)
      throw new AiServiceError(
        "This conversation exceeds the configured context window. Start a fresh conversation or update Configure.",
      );
  }
  const resolved = resolveLanguageModel(connection, secret, modelId);
  const { text } = await generateText({
    ...resolved,
    messages,
    maxOutputTokens,
    maxRetries: 0,
    abortSignal,
    providerOptions: {
      ...resolved.providerOptions,
      openai: { store: false },
      ...(connection.provider === "ollama"
        ? {
            ollama: {
              options: {
                ...(connection.contextWindow
                  ? { num_ctx: connection.contextWindow }
                  : {}),
                num_predict: maxOutputTokens,
              },
            },
          }
        : {}),
    },
  });
  if (!text.trim())
    throw new AiServiceError(
      "The model returned no text. Choose a different model or retry.",
      502,
    );
  return { text };
};
