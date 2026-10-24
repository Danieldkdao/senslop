import { expect, test, vi } from "vitest";
import { generateText, isStepCount, Output, tool } from "ai";
import { z } from "zod";
import { formatProvider, type ProviderConfigSchema } from "@senslop/contracts";
import { resolveLanguageModel } from "../provider-runtime";

vi.mock("server-only", () => ({}));

type WireProtocol =
  | "responses"
  | "messages"
  | "gemini"
  | "chat"
  | "mistral"
  | "ollama"
  | "gateway";
type ContractCase = {
  provider: ProviderConfigSchema["provider"];
  modelId: string;
  protocol: WireProtocol;
  path: string;
};

const cases: ContractCase[] = [
  {
    provider: "chatgpt",
    modelId: "gpt-5.4",
    protocol: "responses",
    path: "/v1/responses",
  },
  {
    provider: "grok",
    modelId: "grok-4.20",
    protocol: "responses",
    path: "/v1/responses",
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    protocol: "messages",
    path: "/v1/messages",
  },
  {
    provider: "google",
    modelId: "gemini-3.1-pro",
    protocol: "gemini",
    path: "/v1beta/models/gemini-3.1-pro:generateContent",
  },
  {
    provider: "mistral",
    modelId: "mistral-medium-latest",
    protocol: "mistral",
    path: "/v1/chat/completions",
  },
  {
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    protocol: "chat",
    path: "/v1/chat/completions",
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-5.4",
    protocol: "chat",
    path: "/api/v1/chat/completions",
  },
  {
    provider: "llama-cpp",
    modelId: "fixture",
    protocol: "chat",
    path: "/v1/chat/completions",
  },
  {
    provider: "lm-studio",
    modelId: "fixture",
    protocol: "chat",
    path: "/v1/chat/completions",
  },
  {
    provider: "ollama",
    modelId: "qwen3",
    protocol: "ollama",
    path: "/api/chat",
  },
  {
    provider: "vercel",
    modelId: "openai/gpt-5.4",
    protocol: "gateway",
    path: "/v4/ai/language-model",
  },
  {
    provider: "opencode",
    modelId: "gpt-5.4",
    protocol: "responses",
    path: "/zen/v1/responses",
  },
  {
    provider: "opencode",
    modelId: "claude-sonnet-4-6",
    protocol: "messages",
    path: "/zen/v1/messages",
  },
  {
    provider: "opencode",
    modelId: "gemini-3.1-pro",
    protocol: "gemini",
    path: "/zen/v1/models/gemini-3.1-pro:generateContent",
  },
  {
    provider: "opencode",
    modelId: "deepseek-v4-pro",
    protocol: "chat",
    path: "/zen/v1/chat/completions",
  },
  {
    provider: "openai-compatible",
    modelId: "fixture",
    protocol: "chat",
    path: "/v1/chat/completions",
  },
  {
    provider: "openai-compatible",
    modelId: "fixture",
    protocol: "responses",
    path: "/v1/responses",
  },
];
const answer = { answer: "valid" };
const text = JSON.stringify(answer);
const reasoning = "fixture reasoning";
const toolId = "call00001";
const input = { path: "a.ts" };
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 2, reasoning: 1 },
};

// Fixtures retain the provider's documented wire shape and pass through the installed SDK.
const wireResponse = (
  { protocol, modelId, provider }: ContractCase,
  callingTool = false,
): object => {
  switch (protocol) {
    case "responses":
      return {
        id: "resp-fixture",
        object: "response",
        created_at: 1,
        status: "completed",
        model: modelId,
        output: [
          {
            id: "rs-fixture",
            type: "reasoning",
            status: "completed",
            summary: [{ type: "summary_text", text: reasoning }],
            encrypted_content: "encrypted-fixture",
          },
          callingTool
            ? {
                id: "fc-fixture",
                type: "function_call",
                name: "readSource",
                call_id: toolId,
                arguments: JSON.stringify(input),
                status: "completed",
              }
            : {
                id: "msg-fixture",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text, annotations: [] }],
              },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 3,
          total_tokens: 13,
          output_tokens_details: { reasoning_tokens: 1 },
        },
      };
    case "messages":
      return {
        id: "msg-fixture",
        type: "message",
        role: "assistant",
        model: modelId,
        content: [
          {
            type: "thinking",
            thinking: reasoning,
            signature: "signature-fixture",
          },
          callingTool
            ? { type: "tool_use", id: toolId, name: "readSource", input }
            : { type: "text", text },
        ],
        stop_reason: callingTool ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 3 },
      };
    case "gemini":
      return {
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                { text: reasoning, thought: true },
                callingTool
                  ? {
                      functionCall: { name: "readSource", args: input },
                      thoughtSignature: "c2lnbmF0dXJl",
                    }
                  : { text },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 2,
          thoughtsTokenCount: 1,
          totalTokenCount: 13,
        },
      };
    case "chat":
    case "mistral":
      return {
        id: "chat-fixture",
        object: "chat.completion",
        created: 1,
        model: modelId,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: callingTool
                ? null
                : protocol === "mistral"
                  ? [
                      {
                        type: "thinking",
                        thinking: [{ type: "text", text: reasoning }],
                      },
                      { type: "text", text },
                    ]
                  : text,
              ...(protocol === "chat"
                ? provider === "openrouter"
                  ? { reasoning }
                  : { reasoning_content: reasoning }
                : {}),
              ...(callingTool
                ? {
                    tool_calls: [
                      {
                        id: toolId,
                        type: "function",
                        function: {
                          name: "readSource",
                          arguments: JSON.stringify(input),
                        },
                      },
                    ],
                  }
                : {}),
            },
            finish_reason: callingTool ? "tool_calls" : "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 3,
          total_tokens: 13,
          completion_tokens_details: { reasoning_tokens: 1 },
        },
      };
    case "ollama":
      return {
        model: modelId,
        created_at: "2026-10-23T00:00:00Z",
        done: true,
        done_reason: "stop",
        message: {
          role: "assistant",
          content: callingTool ? "" : text,
          thinking: reasoning,
          ...(callingTool
            ? {
                tool_calls: [
                  { function: { name: "readSource", arguments: input } },
                ],
              }
            : {}),
        },
        prompt_eval_count: 10,
        eval_count: 3,
      };
    case "gateway":
      return {
        content: [
          { type: "reasoning", text: reasoning },
          callingTool
            ? {
                type: "tool-call",
                toolCallId: toolId,
                toolName: "readSource",
                input: JSON.stringify(input),
              }
            : { type: "text", text },
        ],
        finishReason: {
          unified: callingTool ? "tool-calls" : "stop",
          raw: callingTool ? "tool_calls" : "stop",
        },
        usage,
        warnings: [],
      };
  }
};

const runtime = (entry: ContractCase, fetcher: typeof fetch) => {
  const config: ProviderConfigSchema = {
    provider: entry.provider,
    name: "Fixture",
    model: "",
    contextWindow: null,
    baseURL: formatProvider(entry.provider).baseURL,
    ...(entry.provider === "openai-compatible"
      ? {
          models: [
            {
              id: entry.modelId,
              contextWindow: 16384,
              maxOutputTokens: 2048,
              maxCompletionTokens: 2048,
              supportsTools: true,
              supportsImages: false,
              supportsParallelToolCalls: true,
              supportsPromptCacheKey: false,
              supportsThinking: true,
              supportsChatCompletions: entry.protocol === "chat",
              usesMaxTokens: true,
            },
          ],
        }
      : {}),
  };
  return resolveLanguageModel(config, "fixture-key", entry.modelId, fetcher);
};

test.each(cases)(
  "$provider $protocol normalizes structured text, reasoning and usage",
  async (entry) => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(new URL(String(url)).pathname).toBe(entry.path);
      return Response.json(wireResponse(entry));
    });
    const result = await generateText({
      ...runtime(entry, fetcher),
      prompt: "Return JSON",
      maxRetries: 0,
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
    });
    expect(result.output).toEqual(answer);
    expect(result.finalStep.reasoningText).toContain(reasoning);
    expect(result.usage.inputTokens).toBe(10);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
