import { expect, test, vi } from "vitest";
import { generateText } from "ai";
import type { ProviderConfigSchema } from "@senslop/contracts";
import { resolveLanguageModel } from "../provider-runtime";

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

test("required credentials fail before creating a model or making requests", () => {
  const fetcher = vi.fn();
  expect(() =>
    resolveLanguageModel(connection("chatgpt"), null, "test-model", fetcher),
  ).toThrow("API key");
  expect(fetcher).not.toHaveBeenCalled();
});

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
