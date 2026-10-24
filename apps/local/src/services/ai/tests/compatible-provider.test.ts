import { expect, test, vi } from "vitest";
import { generateText, tool } from "ai";
import { z } from "zod";
import type {
  ProviderConfigSchema,
  CompatibleModelSchema,
} from "@senslop/contracts";
import { resolveLanguageModel } from "../provider-runtime";

vi.mock("server-only", () => ({}));
const model: CompatibleModelSchema = {
  id: "custom/model",
  maxCompletionTokens: 1024,
  maxOutputTokens: 512,
  contextWindow: 16000,
  supportsTools: true,
  supportsImages: false,
  supportsParallelToolCalls: false,
  supportsPromptCacheKey: false,
  supportsChatCompletions: true,
  usesMaxTokens: false,
  supportsThinking: false,
};
const connection = (
  override: Partial<CompatibleModelSchema> = {},
): ProviderConfigSchema => ({
  provider: "openai-compatible",
  name: "Custom",
  baseURL: "https://custom.test/v1",
  contextWindow: null,
  model: "",
  models: [{ ...model, ...override }],
});
const chatResponse = () =>
  Response.json({
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
  });

test.each([false, true])(
  "compatible chat uses the configured output field, legacy=%s",
  async (legacy) => {
    let body: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://custom.test/v1/chat/completions");
      body = JSON.parse(String(init?.body));
      return chatResponse();
    };
    await generateText({
      ...resolveLanguageModel(
        connection({ usesMaxTokens: legacy }),
        "secret",
        model.id,
        fetcher,
      ),
      prompt: "Reply",
      maxOutputTokens: 10000,
    });
    expect(body[legacy ? "max_tokens" : "max_completion_tokens"]).toBe(512);
    expect(
      body[legacy ? "max_completion_tokens" : "max_tokens"],
    ).toBeUndefined();
  },
);

test.each([false, true])(
  "compatible capabilities govern tools, parallel calls, caching and reasoning, enabled=%s",
  async (enabled) => {
    let body: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return chatResponse();
    };
    await generateText({
      ...resolveLanguageModel(
        connection({
          supportsTools: enabled,
          supportsParallelToolCalls: enabled,
          supportsPromptCacheKey: enabled,
          supportsThinking: enabled,
        }),
        "secret",
        model.id,
        fetcher,
      ),
      prompt: "Reply",
      reasoning: "medium",
      tools: {
        inspect: tool({
          inputSchema: z.object({}),
          execute: async () => "source",
        }),
      },
    });
    expect(Array.isArray(body.tools)).toBe(enabled);
    expect(body.parallel_tool_calls).toBe(enabled ? true : undefined);
    expect(typeof body.prompt_cache_key === "string").toBe(enabled);
    expect(body.reasoning_effort).toBe(enabled ? "medium" : undefined);
  },
);

test.each([false, true])(
  "a compatible model uses Responses with its output limit and thinking support=%s",
  async (thinking) => {
    let body: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://custom.test/v1/responses");
      body = JSON.parse(String(init?.body));
      return Response.json({
        id: "response-test",
        created_at: 1,
        status: "completed",
        model: model.id,
        output: [
          {
            id: "message-test",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "ok", annotations: [] }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 },
      });
    };
    const result = await generateText({
      ...resolveLanguageModel(
        connection({
          supportsChatCompletions: false,
          supportsThinking: thinking,
        }),
        "secret",
        model.id,
        fetcher,
      ),
      prompt: "Reply",
      maxOutputTokens: 9999,
      reasoning: "medium",
    });
    expect(result.text).toBe("ok");
    expect(body.max_output_tokens).toBe(512);
    expect(body.reasoning).toEqual(
      thinking ? expect.objectContaining({ effort: "medium" }) : undefined,
    );
  },
);

test("compatible local endpoints share capacity with built-in local connections", async () => {
  const custom = { ...connection(), baseURL: "http://localhost:13766/v1" };
  const models = [
    resolveLanguageModel(custom, "secret", model.id),
    resolveLanguageModel(
      { ...custom, provider: "lm-studio", models: undefined },
      null,
      "another-model",
    ),
  ];
  let active = 0;
  let peak = 0;
  await Promise.all(
    models.map((resolved) =>
      resolved.requestLimiter!.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      }),
    ),
  );
  expect(peak).toBe(1);
});

test("unknown models and unsupported images fail before any provider request", async () => {
  const fetcher = vi.fn();
  expect(() =>
    resolveLanguageModel(connection(), "secret", "unknown", fetcher),
  ).toThrow(/configured/);
  await expect(
    generateText({
      ...resolveLanguageModel(connection(), "secret", model.id, fetcher),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: new Uint8Array([1, 2, 3]),
              mediaType: "image/png",
            },
          ],
        },
      ],
      maxRetries: 0,
    }),
  ).rejects.toThrow(/images/);
  expect(fetcher).not.toHaveBeenCalled();
});
