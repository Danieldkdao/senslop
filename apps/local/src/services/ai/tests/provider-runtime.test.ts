import { expect, test, vi } from "vitest";
import { generateText, APICallError, Output } from "ai";
import { z } from "zod";
import type { ProviderConfigSchema } from "@senslop/contracts";
import { resolveLanguageModel } from "../provider-runtime";
import { formatAiError } from "../errors";
import { defaultConnectionCapacity } from "../../../features/ai-capacity/lib/capacity";
import {
  createReviewBatchSchema,
  createReviewRepairSchema,
} from "../analysis-repair-schemas";

vi.mock("server-only", () => ({}));

const connection = (
  provider: ProviderConfigSchema["provider"],
  baseURL = "https://example.test/v1",
): ProviderConfigSchema => ({
  provider,
  baseURL,
  name: "Test",
  model: "",
  contextWindow: null,
});

test("subscription accounts keep the same capacity pool when access tokens rotate", async () => {
  const config = {
    ...connection("chatgpt-subscription"),
    account: {
      email: "test@example.test",
      subject: crypto.randomUUID(),
      plan: null,
    },
  };
  const capacity = { ...defaultConnectionCapacity(config), concurrency: 1 };
  let active = 0;
  let peak = 0;
  await Promise.all(
    ["old-token", "refreshed-token"].map((token) => {
      const resolved = resolveLanguageModel(
        config,
        token,
        "fixture",
        undefined,
        capacity,
      );
      return resolved.requestLimiter!.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
      });
    }),
  );
  expect(peak).toBe(1);
});

test("required credentials fail before creating a model or making requests", () => {
  const fetcher = vi.fn();
  expect(() =>
    resolveLanguageModel(connection("chatgpt"), null, "test-model", fetcher),
  ).toThrow("API key");
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(["lm-studio", "llama-cpp"] as const)(
  "%s sends structured schemas to its compatible server",
  async (provider) => {
    let body: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: '{"answer":"valid"}' },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    };
    const result = await generateText({
      ...resolveLanguageModel(connection(provider), null, "fixture", fetcher),
      prompt: "Respond",
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
    });
    expect(result.output).toEqual({ answer: "valid" });
    expect(body?.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { schema: { properties: { answer: { type: "string" } } } },
    });
  },
);

test("cloud model calls using the same provider credentials share an adaptive request limit", async () => {
  const releases: (() => void)[] = [];
  let active = 0;
  let peak = 0;
  const fetcher: typeof fetch = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return Response.json({
      id: "fixture",
      object: "chat.completion",
      created: 1,
      model: "fixture",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };
  const runs = Array.from({ length: 3 }, (_, id) =>
    generateText({
      ...resolveLanguageModel(
        connection("mistral"),
        "shared-limiter-fixture",
        `model-${id}`,
        fetcher,
      ),
      prompt: "hello",
      maxRetries: 0,
    }),
  );
  await vi.waitFor(() => expect(releases).toHaveLength(2));
  expect(peak).toBe(2);
  releases.shift()!();
  await vi.waitFor(() => expect(releases).toHaveLength(2));
  for (const release of releases) release();
  await Promise.all(runs);
  expect(peak).toBe(2);
});

test.each(["lm-studio", "llama-cpp", "ollama"] as const)(
  "%s serializes calls across models and saved credentials without ramping up",
  async (provider) => {
    let active = 0;
    let peak = 0;
    const fetcher: typeof fetch = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return Response.json(
        provider === "ollama"
          ? {
              model: "fixture",
              created_at: "2026-10-18T00:00:00Z",
              message: { role: "assistant", content: "ok" },
              done: true,
              done_reason: "stop",
              prompt_eval_count: 1,
              eval_count: 1,
            }
          : {
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "ok" },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            },
      );
    };
    await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        generateText({
          ...resolveLanguageModel(
            connection(provider),
            `local-key-${index % 2}`,
            `model-${index % 3}`,
            fetcher,
          ),
          prompt: "hello",
          maxRetries: 0,
        }),
      ),
    );
    expect(peak).toBe(1);
  },
);

test.each([
  ["chatgpt", "test-model", "/v1/responses", "authorization"],
  [
    "google",
    "gemini-test",
    "/v1/models/gemini-test:generateContent",
    "x-goog-api-key",
  ],
  ["anthropic", "claude-test", "/v1/messages", "x-api-key"],
  ["grok", "grok-test", "/v1/responses", "authorization"],
  ["mistral", "mistral-test", "/v1/chat/completions", "authorization"],
  ["deepseek", "deepseek-test", "/v1/chat/completions", "authorization"],
  ["openrouter", "author/model", "/v1/chat/completions", "authorization"],
  ["llama-cpp", "loaded-model", "/v1/chat/completions", "authorization"],
  ["lm-studio", "loaded-model", "/v1/chat/completions", "authorization"],
  ["opencode", "gpt-5.4", "/v1/responses", "authorization"],
  ["opencode", "claude-sonnet-4-6", "/v1/messages", "x-api-key"],
  [
    "opencode",
    "gemini-3.1-pro",
    "/v1/models/gemini-3.1-pro:generateContent",
    "x-goog-api-key",
  ],
  ["opencode", "deepseek-v4-pro", "/v1/chat/completions", "authorization"],
] as const)(
  "%s routes %s through its protocol using the supplied credential",
  async (provider, modelId, path, header) => {
    let captured: { url: string; headers: Headers } | undefined;
    const fetcher: typeof fetch = async (url, init) => {
      captured = { url: String(url), headers: new Headers(init?.headers) };
      return Response.json(
        { error: { message: "test rejection" } },
        { status: 401 },
      );
    };
    const resolved = resolveLanguageModel(
      connection(provider),
      "isolated-test-key",
      modelId,
      fetcher,
    );
    await expect(
      generateText({ ...resolved, prompt: "Hello", maxRetries: 0 }),
    ).rejects.toThrow();
    expect(new URL(captured!.url).pathname).toBe(path);
    expect(captured!.headers.get(header)).toContain("isolated-test-key");
  },
);

test("keyless local servers work without ambient credentials and refuse redirects", async () => {
  let captured: RequestInit | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    captured = init;
    return Response.json({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };
  const resolved = resolveLanguageModel(
    connection("llama-cpp"),
    null,
    "local-model",
    fetcher,
  );
  expect((await generateText({ ...resolved, prompt: "Hello" })).text).toBe(
    "Hello",
  );
  expect(new Headers(captured?.headers).has("authorization")).toBe(false);
  expect(captured?.redirect).toBe("error");
});

test("Gateway uses its native default endpoint and this connection's key", async () => {
  let captured: { url: string; headers: Headers } | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    captured = { url: String(url), headers: new Headers(init?.headers) };
    return Response.json({ error: "test rejection" }, { status: 401 });
  };
  const resolved = resolveLanguageModel(
    connection("vercel"),
    "gateway-test-key",
    "openai/gpt-5.4",
    fetcher,
  );
  await expect(
    generateText({ ...resolved, prompt: "Hello", maxRetries: 0 }),
  ).rejects.toThrow();
  expect(captured!.url).toContain("https://ai-gateway.vercel.sh/v4/ai/");
  expect(captured!.headers.get("authorization")).toBe(
    "Bearer gateway-test-key",
  );
});

test("Ollama uses the native API and forwards the configured context size", async () => {
  let captured: { url: string; body: string } | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    captured = { url: String(url), body: String(init?.body) };
    return Response.json({
      model: "local-model",
      created_at: "2026-10-10T00:00:00Z",
      message: { role: "assistant", content: "Hello" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 1,
      eval_count: 1,
    });
  };
  const resolved = resolveLanguageModel(
    { ...connection("ollama", "http://localhost:11434"), contextWindow: 8192 },
    null,
    "local-model",
    fetcher,
  );
  expect((await generateText({ ...resolved, prompt: "Hello" })).text).toBe(
    "Hello",
  );
  expect(captured!.url).toBe("http://localhost:11434/api/chat");
  expect(JSON.parse(captured!.body).options.num_ctx).toBe(8192);
});

test("OpenCode refuses unknown protocols rather than guessing", () => {
  expect(() =>
    resolveLanguageModel(connection("opencode"), "test-key", "unknown-model"),
  ).toThrow("protocol");
});

test("OpenRouter HTTP 200 envelopes carrying upstream 502 are retried as provider failures", async () => {
  const fetcher = vi.fn<typeof fetch>(async (): Promise<Response> =>
    fetcher.mock.calls.length === 1
      ? Response.json({
          error: {
            code: 502,
            message: "Upstream error from Nvidia: Internal server error",
            metadata: { error_type: "provider_unavailable" },
          },
        })
      : Response.json({
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Recovered" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
        }),
  );
  const resolved = resolveLanguageModel(
    connection("openrouter"),
    "fixture-key",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    fetcher,
  );
  await expect(
    generateText({
      ...resolved,
      prompt: "Fixture",
      maxOutputTokens: 16000,
      providerOptions: { openrouter: { reasoning: { max_tokens: 2048 } } },
      maxRetries: 1,
    }),
  ).resolves.toMatchObject({ text: "Recovered" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test.each([400, 401, 502])(
  "OpenRouter reports the real %i error code without exposing request content",
  async (code) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: {
            code,
            message: "TEST_PRIVATE_PROVIDER_OUTPUT",
            metadata: { error_type: "provider_unavailable" },
          },
        },
        {
          headers: {
            "set-cookie": "TEST_PRIVATE_COOKIE",
            "x-generation-id": "fixture-generation",
            "retry-after": "1",
          },
        },
      ),
    );
    const resolved = resolveLanguageModel(
      connection("openrouter"),
      "TEST_PRIVATE_KEY",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      fetcher,
    );
    const error = await generateText({
      ...resolved,
      prompt: "TEST_PRIVATE_SOURCE",
      maxRetries: 0,
    }).catch((error) => error);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(error.statusCode).toBe(code);
    expect(error.isRetryable).toBe(code === 502);
    expect(error.requestBodyValues).toBeUndefined();
    expect(error.responseBody).toBeUndefined();
    expect(error.responseHeaders).toEqual({
      "x-generation-id": "fixture-generation",
      "retry-after": "1",
    });
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/TEST_PRIVATE/);
    expect(log).toHaveBeenCalledWith(
      "[senslop:ai-provider]",
      expect.objectContaining({
        statusCode: code,
        transportStatus: 200,
        retryable: code === 502,
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test("persistent upstream failures stop after the retry budget and keep the availability message", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      error: { code: 502, message: "TEST_PRIVATE_PROVIDER_OUTPUT" },
    }),
  );
  const resolved = resolveLanguageModel(
    connection("openrouter"),
    "TEST_PRIVATE_KEY",
    "nemotron",
    fetcher,
  );
  const error = await generateText({
    ...resolved,
    prompt: "TEST_PRIVATE_SOURCE",
    maxRetries: 1,
  }).catch((error) => error);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(formatAiError(error)).toContain("temporarily unavailable");
  expect(JSON.stringify(error)).not.toMatch(/TEST_PRIVATE/);
});

test("an aborted request does not send a retry to the provider", async () => {
  const abort = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async () => {
    abort.abort();
    return Response.json({ error: { code: 502, message: "Unavailable" } });
  });
  const resolved = resolveLanguageModel(
    connection("openrouter"),
    "fixture-key",
    "nemotron",
    fetcher,
  );
  await expect(
    generateText({
      ...resolved,
      prompt: "Fixture",
      maxRetries: 2,
      abortSignal: abort.signal,
    }),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("Google models and credentials at the same endpoint share the 250,000 input TPM budget", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        candidates: [
          {
            content: { role: "model", parts: [{ text: "Done" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 125000,
          candidatesTokenCount: 1,
          totalTokenCount: 125001,
        },
      }),
    );
    const googleConnection = connection(
      "google",
      "https://shared-project.test/v1beta",
    );
    const first = resolveLanguageModel(
      googleConnection,
      "first-fixture-key",
      "gemini-first",
      fetcher,
    );
    const second = resolveLanguageModel(
      googleConnection,
      "second-fixture-key",
      "gemini-second",
      fetcher,
    );
    expect(first.requestLimiter?.state()).toEqual(
      second.requestLimiter?.state(),
    );
    const requests = [first, second].map((resolved) =>
      generateText({
        model: resolved.model,
        prompt: "x".repeat(125000),
        maxRetries: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59998);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(requests);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("Gemini receives a compilable output schema while SDK array bounds remain enforced", async () => {
  let captured: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    const schema = (
      captured!.generationConfig as { responseJsonSchema: unknown }
    ).responseJsonSchema;
    if (JSON.stringify(schema).includes('"maxItems"'))
      return Response.json(
        {
          error: {
            code: 400,
            message: "Request contains an invalid argument.",
            status: "INVALID_ARGUMENT",
          },
        },
        { status: 400 },
      );
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: '{"files":["a","b","c"]}' }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 10,
        totalTokenCount: 20,
      },
    });
  };
  const resolved = resolveLanguageModel(
    connection("google", "https://schema-fixture.test/v1beta"),
    "fixture-key",
    "gemini-3.5-flash-lite",
    fetcher,
  );
  await expect(
    generateText({
      model: resolved.model,
      prompt: "Synthetic",
      output: Output.object({
        schema: z.object({ files: z.array(z.string()).max(2) }),
      }),
      maxRetries: 0,
    }),
  ).rejects.toThrow(/schema/);
  expect(JSON.stringify(captured!.generationConfig as object)).not.toContain(
    '"maxItems"',
  );
});

test("Gemini review requests remove expanding array bounds but still reject missing file coverage", async () => {
  const paths = Array.from({ length: 24 }, (_, index) => `${index}.ts`);
  let captured: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  files: paths.slice(1).map((path) => ({ path, findings: [] })),
                  limitations: [],
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
    });
  };
  const resolved = resolveLanguageModel(
    connection("google", "https://review-bounds.test/v1beta"),
    "fixture-key",
    "gemini-3.5-flash-lite",
    fetcher,
  );
  await expect(
    generateText({
      model: resolved.model,
      prompt: "Assess all 24 synthetic files.",
      output: Output.object({ schema: createReviewBatchSchema(paths) }),
      maxRetries: 0,
    }),
  ).rejects.toThrow(/schema/);
  const serialized = JSON.stringify(captured!.generationConfig);
  expect(serialized).not.toContain('"minItems":24');
  expect(serialized).not.toContain('"maxItems":');
});

test("Gemini targeted repairs retain empty-array constraints for already accepted sections", async () => {
  let captured: Record<string, unknown> | undefined;
  const patch = {
    files: [],
    findings: [{ id: "finding-0", finding: null }],
    limitations: [],
  };
  const fetcher: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return Response.json({
      candidates: [
        {
          content: { role: "model", parts: [{ text: JSON.stringify(patch) }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
    });
  };
  const resolved = resolveLanguageModel(
    connection("google", "https://repair-bounds.test/v1beta"),
    "fixture-key",
    "gemini-3.5-flash-lite",
    fetcher,
  );
  const result = await generateText({
    model: resolved.model,
    prompt: "Retract finding-0. Leave files and limitations empty.",
    output: Output.object({
      schema: createReviewRepairSchema([], ["finding-0"], false),
    }),
    maxRetries: 0,
  });
  expect(result.output).toEqual(patch);
  expect(captured!.generationConfig).toMatchObject({
    responseJsonSchema: {
      properties: {
        files: { maxItems: 0 },
        limitations: { maxItems: 0 },
      },
    },
  });
});

test("MiMo uses JSON mode through Gateway while SDK still validates the requested object", async () => {
  let captured:
    { responseFormat?: { type: string; schema?: unknown } } | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return Response.json({
      content: [{ type: "text", text: '{"answer":"valid"}' }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: captured?.responseFormat?.schema
        ? [{ type: "unsupported", feature: "responseFormat" }]
        : [],
    });
  };
  const resolved = resolveLanguageModel(
    connection("vercel"),
    "fixture-key",
    "xiaomi/mimo-v2.6-flash",
    fetcher,
  );
  const result = await generateText({
    model: resolved.model,
    prompt: "Synthetic",
    output: Output.object({ schema: z.object({ answer: z.string() }) }),
    maxRetries: 0,
  });
  expect(result.output).toEqual({ answer: "valid" });
  expect(captured?.responseFormat).toEqual({ type: "json" });
  expect(result.warnings).toEqual([]);
});
