import { createHash } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ProviderConfigSchema } from "@senslop/contracts";
import { getCompatibleModel } from "../../features/providers/lib/compatible-models";

export const createCompatibleModel = (
  connection: ProviderConfigSchema,
  secret: string,
  modelId: string,
  fetcher: typeof fetch,
) => {
  const model = getCompatibleModel(connection, modelId)!;
  const compatibleFetch: typeof fetch = (url, init) => {
    if (typeof init?.body !== "string") return fetcher(url, init);
    const body: Record<string, unknown> = JSON.parse(init.body);
    const limit = Math.min(
      Number(
        body.max_tokens ??
          body.max_completion_tokens ??
          body.max_output_tokens ??
          model.maxOutputTokens,
      ),
      model.maxOutputTokens,
      model.supportsChatCompletions ? model.maxCompletionTokens : Infinity,
    );
    delete body.max_tokens;
    delete body.max_completion_tokens;
    delete body.max_output_tokens;
    body[
      model.supportsChatCompletions
        ? model.usesMaxTokens
          ? "max_tokens"
          : "max_completion_tokens"
        : "max_output_tokens"
    ] = limit;
    if (!model.supportsTools) {
      delete body.tools;
      delete body.tool_choice;
      delete body.parallel_tool_calls;
    } else if (model.supportsParallelToolCalls) body.parallel_tool_calls = true;
    else delete body.parallel_tool_calls;
    if (model.supportsPromptCacheKey)
      body.prompt_cache_key = createHash("sha256")
        .update(`${connection.baseURL}:${modelId}`)
        .digest("hex");
    else delete body.prompt_cache_key;
    if (!model.supportsThinking) {
      delete body.reasoning_effort;
      delete body.reasoning;
    }
    return fetcher(url, { ...init, body: JSON.stringify(body) });
  };
  const options = {
    baseURL: connection.baseURL.replace(/\/$/, ""),
    apiKey: secret,
    fetch: compatibleFetch,
  };
  return model.supportsChatCompletions
    ? createOpenAICompatible({
        ...options,
        name: "openai-compatible",
        supportsStructuredOutputs: false,
      }).chatModel(modelId)
    : createOpenAI(options).responses(modelId);
};
