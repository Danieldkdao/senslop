import { expect, test, vi } from "vitest";
import type { ProviderConfigSchema } from "@senslop/contracts";
import { discoverModels } from "../lib/model-catalog";

const connection = (
  provider: ProviderConfigSchema["provider"],
): ProviderConfigSchema => ({
  provider,
  name: "Test",
  baseURL: "https://models.test/v1",
  model: "",
  contextWindow: null,
});

test("custom provider model selection uses saved models without probing the server", async () => {
  const fetcher = vi.fn();
  const model = {
    id: "my/model",
    maxCompletionTokens: 32000,
    maxOutputTokens: 4096,
    contextWindow: 32000,
    supportsTools: true,
    supportsImages: false,
    supportsParallelToolCalls: false,
    supportsPromptCacheKey: false,
    supportsChatCompletions: true,
    usesMaxTokens: false,
    supportsThinking: false,
  };
  const catalog = await discoverModels(
    { ...connection("openai-compatible"), models: [model] },
    "secret",
    undefined,
    fetcher,
  );
  expect(catalog.models).toEqual([
    expect.objectContaining({ id: model.id, available: true }),
  ]);
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  {
    error:
      "Your newly created team doesn't have any credits or licenses yet. You can purchase those on https://console.x.ai/team/private-team.",
  },
  {
    error: {
      message:
        "Your team doesn't have any credits or licenses yet. echoed-private-key",
    },
  },
])(
  "xAI credit restrictions explain billing instead of rejecting the key",
  async (payload) => {
    const request = discoverModels(
      connection("grok"),
      "echoed-private-key",
      undefined,
      async () => Response.json(payload, { status: 403 }),
    );
    await expect(request).rejects.toThrow(
      "xAI blocked model access because this team has no credits or licenses. Set up billing in the xAI Console, then retry.",
    );
  },
);

test.each([
  [401, { error: "Your team doesn't have any credits or licenses yet." }],
  [403, { error: "This key does not have permission. echoed-private-key" }],
  [403, { error: { message: 42 } }],
] as const)(
  "xAI HTTP %s without a confirmed billing restriction keeps safe credential feedback",
  async (status, payload) => {
    await expect(
      discoverModels(
        connection("grok"),
        "echoed-private-key",
        undefined,
        async () => Response.json(payload, { status }),
      ),
    ).rejects.toThrow(
      "Provider rejected the credentials. Update the key in Configure and retry.",
    );
  },
);

test.each([
  "Invalid error body echoed-private-key",
  JSON.stringify({
    error:
      "Your team doesn't have any credits or licenses yet." +
      "x".repeat(4 * 1024 * 1024),
  }),
])("unreadable xAI errors keep safe feedback", async (body) => {
  await expect(
    discoverModels(
      connection("grok"),
      "echoed-private-key",
      undefined,
      async () => new Response(body, { status: 403 }),
    ),
  ).rejects.toThrow(
    "Provider rejected the credentials. Update the key in Configure and retry.",
  );
});

test("Mistral aliases produce one option per model without merging distinct versions", async () => {
  const data = [
    {
      id: "ministral-8b-latest",
      name: "ministral-8b-2512",
      aliases: ["ministral-8b-2512"],
    },
    {
      id: "ministral-8b-2512",
      name: "ministral-8b-2512",
      aliases: ["ministral-8b-latest"],
    },
    {
      id: "mistral-medium-3-5",
      name: "mistral-medium-latest",
      aliases: ["mistral-medium-latest", "mistral-medium"],
    },
    {
      id: "mistral-medium-latest",
      name: "mistral-medium-latest",
      aliases: ["mistral-medium", "mistral-medium-3-5"],
    },
    {
      id: "mistral-medium",
      name: "mistral-medium-latest",
      aliases: ["mistral-medium-latest", "mistral-medium-3-5"],
    },
    { id: "ministral-8b-2409", name: "Older Ministral" },
    { id: "ft:custom-a", name: "Custom", aliases: [] },
    { id: "ft:custom-b", name: "Custom", aliases: [] },
  ];
  const discover = (rows: typeof data) =>
    discoverModels(connection("mistral"), "test-key", undefined, async () =>
      Response.json({ data: rows }),
    );
  const catalog = await discover(data);
  expect(catalog.models).toHaveLength(5);
  expect(
    catalog.models.find((model) => model.id === "ministral-8b-2512"),
  ).toMatchObject({ aliases: ["ministral-8b-latest"] });
  expect(
    catalog.models.find((model) => model.id === "mistral-medium-latest"),
  ).toMatchObject({ aliases: ["mistral-medium", "mistral-medium-3-5"] });
  expect(new Set(catalog.models.map((model) => model.name)).size).toBe(5);
  expect((await discover([...data].reverse())).models).toEqual(catalog.models);
});

test("Mistral base and fine-tuned chat models remain selectable", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      data: [
        {
          id: "mistral-small-latest",
          type: "base",
          capabilities: { completion_chat: true },
        },
        {
          id: "ft:custom",
          type: "fine-tuned",
          capabilities: { completion_chat: true },
        },
        {
          id: "mistral-embed",
          type: "base",
          capabilities: { completion_chat: false },
        },
      ],
    });
  const catalog = await discoverModels(
    connection("mistral"),
    "test-key",
    undefined,
    fetcher,
  );
  expect(catalog.models.map((model) => model.id)).toEqual([
    "ft:custom",
    "mistral-small-latest",
  ]);
});

test("one-way alias chains collapse without exposing filtered or unlisted model IDs", async () => {
  const result = await discoverModels(
    connection("mistral"),
    "test-key",
    undefined,
    async () =>
      Response.json({
        data: [
          {
            id: "chat-version",
            name: "chat-version",
            aliases: ["chat-latest", "filtered-model", "unlisted-model"],
          },
          {
            id: "chat-latest",
            name: "chat-version",
            aliases: ["chat-channel"],
          },
          { id: "chat-channel", name: "chat-version" },
          { id: "filtered-model", capabilities: { completion_chat: false } },
        ],
      }),
  );
  expect(result.models).toEqual([
    {
      id: "chat-version",
      name: "chat-version",
      available: true,
      aliases: ["chat-channel", "chat-latest"],
    },
  ]);
});

test("Ollama tag capabilities use arrays and only completion models are selectable", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      models: [
        {
          name: "local-chat:latest",
          model: "local-chat:latest",
          capabilities: ["completion", "vision"],
        },
        { name: "local-embed:latest", capabilities: ["embedding"] },
        { name: "legacy-chat:latest" },
      ],
    });
  const catalog = await discoverModels(
    connection("ollama"),
    null,
    undefined,
    fetcher,
  );
  expect(catalog.models.map((model) => model.id)).toEqual([
    "legacy-chat:latest",
    "local-chat:latest",
  ]);
});

test.each([
  [
    "openrouter",
    {
      data: [
        {
          id: "author/chat",
          type: "base",
          architecture: { output_modalities: ["text"] },
        },
      ],
    },
    "author/chat",
  ],
  ["chatgpt", { data: [{ id: "gpt-test", type: "base" }] }, "gpt-test"],
  [
    "google",
    {
      models: [
        {
          name: "models/gemini-test",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    },
    "gemini-test",
  ],
  [
    "anthropic",
    { data: [{ id: "claude-test", display_name: "Claude Test" }] },
    "claude-test",
  ],
  ["grok", { data: [{ id: "grok-test" }] }, "grok-test"],
  ["llama-cpp", { data: [{ id: "loaded-chat", type: "llm" }] }, "loaded-chat"],
  ["lm-studio", { data: [{ id: "loaded-chat", type: "llm" }] }, "loaded-chat"],
  [
    "ollama",
    { models: [{ name: "local-chat:latest", capabilities: ["completion"] }] },
    "local-chat:latest",
  ],
  [
    "vercel",
    {
      data: [
        { id: "author/chat", type: "language" },
        { id: "author/embed", type: "embedding" },
      ],
    },
    "author/chat",
  ],
  [
    "mistral",
    {
      data: [
        {
          id: "mistral-test",
          type: "base",
          capabilities: { completion_chat: true },
        },
      ],
    },
    "mistral-test",
  ],
  ["deepseek", { data: [{ id: "deepseek-chat" }] }, "deepseek-chat"],
  ["opencode", { data: [{ id: "claude-test" }] }, "claude-test"],
] as const)(
  "%s discovers its provider-specific chat metadata",
  async (provider, payload, id) => {
    const repeatedPayload =
      "data" in payload
        ? { ...payload, data: [...payload.data, ...payload.data] }
        : { ...payload, models: [...payload.models, ...payload.models] };
    const catalog = await discoverModels(
      connection(provider),
      "test-key",
      undefined,
      async () => Response.json(repeatedPayload),
    );
    expect(catalog.models.map((model) => model.id)).toEqual([id]);
  },
);

test("OpenRouter preserves names, filters nontext outputs, and deduplicates IDs", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      data: [
        {
          id: "author/chat",
          name: "Friendly Chat",
          architecture: { output_modalities: ["text"] },
        },
        { id: "author/image", architecture: { output_modalities: ["image"] } },
        { id: "author/chat", name: "Duplicate" },
      ],
    });
  const result = await discoverModels(
    connection("openrouter"),
    "test-key",
    undefined,
    fetcher,
  );
  expect(result.models).toEqual([
    { id: "author/chat", name: "Friendly Chat", available: true },
  ]);
  expect(result.source).toBe("live");
});

test("Google paginates using headers and only includes generateContent models", async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    urls.push(String(url));
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-key");
    expect(init?.redirect).toBe("error");
    return urls.length === 1
      ? Response.json({
          models: [
            {
              name: "models/gemini-first",
              displayName: "Gemini First",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "page-two",
        })
      : Response.json({
          models: [
            {
              name: "models/gemini-first",
              displayName: "Duplicate from another page",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-second",
              displayName: "Gemini Second",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        });
  };
  const result = await discoverModels(
    connection("google"),
    "test-key",
    undefined,
    fetcher,
  );
  expect(result.models.map((model) => model.id)).toEqual([
    "gemini-first",
    "gemini-second",
  ]);
  expect(urls[1]).toContain("pageToken=page-two");
  expect(urls.join()).not.toContain("test-key");
});

test("Anthropic paginates without losing display names", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url) => {
    requests++;
    if (requests === 2) expect(String(url)).toContain("after_id=claude-first");
    return Response.json({
      data: [
        {
          id: requests === 1 ? "claude-first" : "claude-second",
          display_name: "Claude",
        },
      ],
      has_more: requests === 1,
      last_id: "claude-first",
    });
  };
  const result = await discoverModels(
    connection("anthropic"),
    "test-key",
    undefined,
    fetcher,
  );
  expect(result.models).toHaveLength(2);
  expect(result.models.map((model) => model.name)).toEqual([
    "Claude (claude-first)",
    "Claude (claude-second)",
  ]);
});

test("direct providers use curated chat filtering and only fall back for unsupported discovery", async () => {
  const live: typeof fetch = async () =>
    Response.json({
      data: [
        { id: "gpt-5.4" },
        { id: "text-embedding-3-small" },
        { id: "whisper-1" },
        { id: "gpt-image-1" },
      ],
    });
  expect(
    (
      await discoverModels(connection("chatgpt"), "test-key", undefined, live)
    ).models.map((model) => model.id),
  ).toEqual(["gpt-5.4"]);
  const unsupported: typeof fetch = async () =>
    new Response(null, { status: 404 });
  expect(
    (
      await discoverModels(
        connection("chatgpt"),
        "test-key",
        undefined,
        unsupported,
      )
    ).source,
  ).toBe("curated");
  const unauthorized: typeof fetch = async () =>
    Response.json({ secret: "must-not-leak" }, { status: 401 });
  await expect(
    discoverModels(connection("chatgpt"), "test-key", undefined, unauthorized),
  ).rejects.toThrow("credentials");
  const malformed: typeof fetch = async () => Response.json({ data: "bad" });
  await expect(
    discoverModels(connection("chatgpt"), "test-key", undefined, malformed),
  ).rejects.toThrow("metadata");
});

test("local discovery allows manual entry when unsupported or offline", async () => {
  const unsupported: typeof fetch = async () =>
    new Response(null, { status: 404 });
  expect(
    await discoverModels(connection("llama-cpp"), null, undefined, unsupported),
  ).toMatchObject({ models: [], source: "manual", manualAllowed: true });
  const offline: typeof fetch = async () => {
    throw new Error("network secret must-not-leak");
  };
  expect(
    (await discoverModels(connection("ollama"), null, undefined, offline))
      .manualAllowed,
  ).toBe(true);
});

test("OpenCode lists unsupported protocols explicitly and formats provider model names", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({ data: [{ id: "claude-sonnet-4-6" }, { id: "jev-1.13" }] });
  const result = await discoverModels(
    connection("opencode"),
    "test-key",
    undefined,
    fetcher,
  );
  expect(result.models[0]).toMatchObject({
    name: "Claude Sonnet 4.6",
    available: true,
  });
  expect(result.models[1]).toMatchObject({ available: false });
});

test("discovery rejects oversized metadata and canceled requests", async () => {
  const oversized: typeof fetch = async () =>
    new Response(" ".repeat(4 * 1024 * 1024 + 1));
  await expect(
    discoverModels(connection("openrouter"), "test-key", undefined, oversized),
  ).rejects.toThrow("metadata");
  const controller = new AbortController();
  controller.abort();
  await expect(
    discoverModels(
      connection("llama-cpp"),
      null,
      controller.signal,
      async () => {
        throw controller.signal.reason;
      },
    ),
  ).rejects.toThrow();
});
