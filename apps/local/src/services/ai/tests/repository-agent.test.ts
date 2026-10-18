import { beforeEach, expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createRepositoryAgent } from "../repository-agent";
import { defaultAiSettings } from "../../../features/agents/constants";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  resolved: {} as object,
  contextResolved: {} as object,
  contextWindow: null as number | null,
  provider: "lm-studio" as "lm-studio" | "openrouter" | "ollama",
}));
vi.mock("../../../features/providers/lib/provider-service", () => ({
  ProviderService: class {
    resolve = async () => ({
      connection: {
        provider: state.provider,
        contextWindow: state.contextWindow,
      },
      secret: null,
    });
  },
}));
vi.mock("../provider-runtime", async () => ({
  ...(await vi.importActual<typeof import("../provider-runtime")>(
    "../provider-runtime",
  )),
  resolveLanguageModel: (
    _connection: unknown,
    _secret: unknown,
    modelId: string,
  ) => (modelId === "context" ? state.contextResolved : state.resolved),
}));
vi.mock("../../credentials/os-credentials", () => ({ osCredentials: {} }));
beforeEach(() => {
  state.contextWindow = null;
  state.provider = "lm-studio";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const resultGroups = {
  groups: [
    {
      title: "Flow",
      rationale: "Guard",
      files: [{ path: "a.ts", summary: "Adds guard", related: [] }],
    },
  ],
};
const resultUsage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const resultAgent = (signal = new AbortController().signal) =>
  createRepositoryAgent({
    local: {} as never,
    snapshot: {
      id: "snapshot",
      source: {},
      files: [{ path: "a.ts", diff: "patch" }],
    } as never,
    settings: defaultAiSettings,
    selection: { connectionId: "connection", modelId: "model", name: "Model" },
    context: {
      sources: { "a.ts": "code" },
      analysis: {
        edges: [],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    signal,
    executionPolicy: { groupingSteps: 4, groupingOutputTokens: 8000 },
  });

const jsonResponse = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: resultUsage,
  warnings: [],
});

test("grouping uses native structured output and never exposes a result submission tool", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      expect(options.responseFormat).toMatchObject({
        type: "json",
        schema: { properties: { groups: expect.any(Object) } },
      });
      expect(options.tools?.some((tool) => tool.name === "submitResult")).toBe(
        false,
      );
      return jsonResponse(resultGroups);
    },
  });
  state.resolved = { model };
  await expect((await resultAgent()).grouping()).resolves.toEqual(resultGroups);
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("format correction reuses frozen tool evidence and preserves reasoning required by multi-turn models", async () => {
  let calls = 0;
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        calls++;
        if (calls === 1)
          return {
            content: [
              { type: "reasoning", text: "RETAIN_TOOL_REASONING" },
              {
                type: "tool-call",
                toolCallId: "read",
                toolName: "readSource",
                input: JSON.stringify({
                  path: "a.ts",
                  start: 1,
                  end: 1,
                  side: "after",
                }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: "tool_calls" },
            usage: resultUsage,
            warnings: [],
          };
        expect(JSON.stringify(options.prompt)).toContain(
          "RETAIN_TOOL_REASONING",
        );
        if (calls === 2)
          return {
            ...jsonResponse({}),
            content: [{ type: "text", text: "TEST_PRIVATE_PROSE" }],
          };
        expect(options.tools ?? []).toEqual([]);
        expect(JSON.stringify(options.prompt)).toContain("a.ts");
        return jsonResponse(resultGroups);
      },
    }),
  };
  await expect((await resultAgent()).grouping()).resolves.toEqual(resultGroups);
  expect(calls).toBe(3);
});

test("a malformed file summary preserves valid files and requests only the defective file", async () => {
  const files = ["a.ts", "b.ts"].map((path) => ({
    path,
    oldPath: null,
    binary: false,
    diff: "patch",
  }));
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      calls++;
      if (calls === 1)
        return jsonResponse({
          groups: [
            {
              title: "Flow",
              rationale: "Why",
              files: [
                { path: "a.ts", summary: "KEEP", related: [] },
                { path: "b.ts", summary: "x".repeat(501), related: [] },
              ],
            },
          ],
        });
      const prompt = options.prompt
        .filter((message) => message.role === "user")
        .flatMap((message) => message.content)
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      const payload = JSON.parse(prompt.split("\nRepair input:\n").at(-1)!);
      expect(payload.pendingFiles).toEqual(["b.ts"]);
      expect(
        payload.changes.map((file: { path: string }) => file.path),
      ).toEqual(["b.ts"]);
      expect(options.tools ?? []).toEqual([]);
      return jsonResponse({
        groups: [],
        files: [
          {
            path: "b.ts",
            summary: "Fixed",
            related: [],
            groupIndex: 0,
            beforePath: null,
          },
        ],
      });
    },
  });
  state.resolved = { model };
  const agent = await createRepositoryAgent({
    local: {} as never,
    snapshot: { id: "snapshot", source: {}, files } as never,
    settings: defaultAiSettings,
    selection: { connectionId: "connection", modelId: "model", name: "Model" },
    context: {
      sources: {},
      analysis: {
        edges: [],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    signal: new AbortController().signal,
  });
  const result = await agent.grouping();
  expect(result.groups[0]!.files.map((file) => file.summary)).toEqual([
    "KEEP",
    "Fixed",
  ]);
  expect(calls).toBe(2);
});

test("malformed structured output is bounded and does not leak source into logs", async () => {
  const log = vi.spyOn(console, "warn");
  const model = new MockLanguageModelV4({
    doGenerate: {
      ...jsonResponse({}),
      content: [{ type: "text", text: "TEST_PRIVATE_MODEL_OUTPUT" }],
    },
  });
  state.resolved = { model };
  await expect((await resultAgent()).grouping()).rejects.toThrow(
    /structured result/,
  );
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(JSON.stringify(log.mock.calls)).not.toContain("TEST_PRIVATE");
  expect(log).toHaveBeenCalledWith(
    "[senslop:ai-result]",
    expect.objectContaining({
      failureKind: "invalid-json",
      responseFormat: "structured-output",
    }),
  );
});

test("cancellation after malformed output prevents format correction", async () => {
  const abort = new AbortController();
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      abort.abort();
      return { ...jsonResponse({}), content: [{ type: "text", text: "bad" }] };
    },
  });
  state.resolved = { model };
  await expect((await resultAgent(abort.signal)).grouping()).rejects.toThrow();
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("review explicitly assesses a file with no findings using structured output", async () => {
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        expect(options.responseFormat).toMatchObject({
          type: "json",
          schema: { properties: { files: expect.any(Object) } },
        });
        expect(
          options.tools?.some((tool) => tool.name === "submitResult"),
        ).toBe(false);
        return jsonResponse({
          files: [{ path: "a.ts", findings: [] }],
          limitations: [],
        });
      },
    }),
  };
  await expect((await resultAgent()).review()).resolves.toMatchObject({
    findings: [],
    fixAllPrompt: expect.stringContaining("No fixes needed"),
  });
});

test.each(["mistral", "lm-studio", "google"] as const)(
  "%s transports the grouping output schema without a submission function",
  async (provider) => {
    const { resolveLanguageModel } = await vi.importActual<
      typeof import("../provider-runtime")
    >("../provider-runtime");
    let body: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      expect(JSON.stringify(body)).not.toContain("submitResult");
      if (provider === "google")
        return Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ text: JSON.stringify(resultGroups) }],
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
      return Response.json({
        id: "fixture",
        object: "chat.completion",
        created: 1,
        model: "fixture",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(resultGroups),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    };
    state.resolved = resolveLanguageModel(
      {
        provider,
        name: "Fixture",
        baseURL: `https://native-${provider}.test/v1`,
        model: "",
        contextWindow: null,
      },
      "fixture-key",
      provider === "google" ? "gemini-3.5-flash-lite" : "fixture",
      fetcher,
    );
    await expect((await resultAgent()).grouping()).resolves.toEqual(
      resultGroups,
    );
    expect(JSON.stringify(body)).toContain("groups");
    if (provider === "lm-studio")
      expect(body?.response_format).toMatchObject({ type: "json_schema" });
    if (provider === "google")
      expect(body?.generationConfig).toMatchObject({
        responseMimeType: "application/json",
      });
  },
);

test("OpenRouter retries only a failed structured-output step and preserves completed source tool work", async () => {
  state.provider = "openrouter";
  const { resolveLanguageModel } = await vi.importActual<
    typeof import("../provider-runtime")
  >("../provider-runtime");
  const bodies: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    const body = JSON.parse(bodies.at(-1)!);
    expect(body.max_tokens).toBe(16000);
    expect(body.reasoning.max_tokens).toBeLessThanOrEqual(8000);
    if (bodies.length === 2)
      return Response.json({
        error: {
          code: 502,
          message: "Transient upstream failure",
          metadata: { error_type: "provider_unavailable" },
        },
      });
    return Response.json({
      choices: [
        {
          index: 0,
          message:
            bodies.length === 1
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "read",
                      type: "function",
                      function: {
                        name: "readSource",
                        arguments: JSON.stringify({
                          path: "a.ts",
                          start: 1,
                          end: 1,
                          side: "after",
                        }),
                      },
                    },
                  ],
                }
              : { role: "assistant", content: JSON.stringify(resultGroups) },
          finish_reason: bodies.length === 1 ? "tool_calls" : "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
  };
  state.resolved = resolveLanguageModel(
    {
      provider: "openrouter",
      name: "Fixture",
      baseURL: "https://retry-structured.test/v1",
      model: "",
      contextWindow: null,
    },
    "fixture-key",
    "author/model",
    fetcher,
  );
  await expect((await resultAgent()).grouping()).resolves.toEqual(resultGroups);
  expect(bodies).toHaveLength(3);
  expect(bodies[1]).toBe(bodies[2]);
});

test("concurrent batches keep context quotas and parent request IDs isolated", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const files = Array.from({ length: 8 }, (_, id) => ({
    path: `${id}.ts`,
    diff: "patch",
  }));
  let contextCalls = 0;
  state.contextResolved = {
    model: new MockLanguageModelV4({
      doGenerate: async () => {
        contextCalls++;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        return {
          content: [{ type: "text", text: "Compact evidence" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
  };
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        const prompt = JSON.stringify(options.prompt);
        if (prompt.includes("Order these prepared files"))
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  groups: [
                    {
                      title: "Flow",
                      rationale: "Change",
                      files: files.map((_, id) => id),
                    },
                  ],
                }),
              },
            ],
            finishReason: { unified: "stop", raw: "stop" },
            usage: resultUsage,
            warnings: [],
          };
        const userText = options.prompt
          .filter((message) => message.role === "user")
          .flatMap((message) => message.content)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        const input = JSON.parse(
          userText.match(/Batch input:\n([^\n]+)/)![1]!,
        ) as { changes: { path: string }[] };
        const path = input.changes[0]!.path;
        const toolResult = options.prompt.some(
          (message) => message.role === "tool",
        );
        expect(prompt).not.toContain("Context-agent request budget reached");
        if (toolResult)
          return jsonResponse({
            groups: [
              {
                title: "Flow",
                rationale: "Change",
                files: [{ path, summary: "Change", related: [] }],
              },
            ],
          });
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: `context-${path}`,
              toolName: "askContext",
              input: JSON.stringify({ query: `Inspect ${path}` }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
  };
  const selection = {
    connectionId: "connection",
    modelId: "model",
    name: "Model",
  };
  const agent = await createRepositoryAgent({
    local: {} as never,
    snapshot: { id: "snapshot", source: {}, files } as never,
    settings: {
      ...defaultAiSettings,
      separate: true,
      roles: {
        grouping: selection,
        review: selection,
        explain: selection,
        context: { ...selection, modelId: "context" },
      },
    },
    selection,
    context: {
      sources: Object.fromEntries(files.map((file) => [file.path, "code"])),
      analysis: {
        edges: [],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    signal: new AbortController().signal,
    executionPolicy: { groupingMaxFiles: 1, batchConcurrency: 8 },
  });
  await expect(agent.grouping()).resolves.toMatchObject({
    groups: [{ files: expect.any(Array) }],
  });
  expect(contextCalls).toBe(8);
  const parents = info.mock.calls
    .filter(
      ([tag, details]) =>
        tag === "[senslop:ai-request]" &&
        details.event === "started" &&
        details.task === "Context retrieval",
    )
    .map(([, details]) => details.parentRequestId);
  expect(parents).toHaveLength(8);
  expect(parents.every((parent) => typeof parent === "string")).toBe(true);
  expect(new Set(parents).size).toBe(8);
});

test("a reasoning allowance fits a small configured window without hiding its remaining answer budget", async () => {
  state.provider = "openrouter";
  state.contextWindow = 16000;
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        const reasoning = options.providerOptions?.openrouter?.reasoning as {
          max_tokens: number;
        };
        expect(reasoning.max_tokens).toBeGreaterThan(0);
        expect(reasoning.max_tokens).toBeLessThan(options.maxOutputTokens!);
        expect(options.maxOutputTokens).toBeLessThanOrEqual(4000);
        const estimated =
          Math.ceil(
            Buffer.byteLength(
              JSON.stringify({ prompt: options.prompt, tools: options.tools }),
            ) / 3,
          ) + options.maxOutputTokens!;
        expect(estimated).toBeLessThan(16000 * 0.8);
        return {
          content: [{ type: "text", text: JSON.stringify(resultGroups) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
  };
  await expect((await resultAgent()).grouping()).resolves.toEqual(resultGroups);
});

test("Ollama provider settings preserve the requested analysis output allowance", async () => {
  state.provider = "ollama";
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        expect(
          (options.providerOptions?.ollama?.options as { num_predict: number })
            .num_predict,
        ).toBe(options.maxOutputTokens);
        return {
          content: [{ type: "text", text: JSON.stringify(resultGroups) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
    providerOptions: {
      ollama: { options: { num_ctx: 16000, num_predict: 2048 } },
    },
  };
  await expect((await resultAgent()).grouping()).resolves.toEqual(resultGroups);
});

test.each([
  [1000000, 80000],
  [1000000, 170000],
  [64000, 80000],
])(
  "a configured %i-token model can group a %i-byte change without a false context-budget failure",
  async (window, bytes) => {
    state.contextWindow = window;
    const groups = {
      groups: [
        {
          title: "Flow",
          rationale: "Change",
          files: [{ path: "a.ts", summary: "Adds code", related: [] }],
        },
      ],
    };
    const generate = vi.fn(async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(groups) }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: {
          total: 100,
          noCache: 100,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 100, text: 100, reasoning: undefined },
      },
      warnings: [],
    }));
    state.resolved = {
      model: new MockLanguageModelV4({ doGenerate: generate }),
    };
    const agent = await createRepositoryAgent({
      local: {} as never,
      snapshot: {
        id: "snapshot",
        source: {},
        files: [{ path: "a.ts", diff: "@@ -0,0 +1 @@\n+" + "a".repeat(bytes) }],
      } as never,
      settings: { ...defaultAiSettings, prompt: "Group changed files." },
      selection: {
        connectionId: "connection",
        modelId: "model",
        name: "Model",
      },
      context: {
        sources: {},
        analysis: {
          edges: [],
          symbols: [],
          diagnostics: [],
          cycles: [],
          limitations: [],
        },
        limitations: [],
      },
      signal: new AbortController().signal,
    });
    await expect(agent.grouping()).resolves.toEqual(groups);
    expect(generate).toHaveBeenCalled();
  },
);

test("grouping consumes validated structured model output and rejects incomplete coverage", async () => {
  const groups = {
    groups: [
      {
        title: "Flow",
        rationale: "why",
        files: [{ path: "a.ts", summary: "guard changed", related: [] }],
      },
    ],
  };
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        expect(
          options.tools?.some(
            (item) => item.type === "function" && item.name === "askContext",
          ),
        ).toBe(false);
        return {
          content: [{ type: "text", text: JSON.stringify(groups) }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
        };
      },
    }),
  };
  const agent = await createRepositoryAgent({
    local: {} as never,
    snapshot: {
      id: "snapshot",
      source: {},
      files: [{ path: "a.ts", diff: "patch" }],
    } as never,
    settings: defaultAiSettings,
    selection: { connectionId: "connection", modelId: "model", name: "Model" },
    context: {
      sources: { "a.ts": "code" },
      analysis: {
        edges: [],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    signal: new AbortController().signal,
  });
  expect(await agent.grouping()).toEqual(groups);
  groups.groups[0]!.files = [];
  await expect(agent.grouping()).rejects.toThrow();
});

test("Context retrieval reserves a final answer after repository tools instead of returning an empty last tool step", async () => {
  let contextCalls = 0;
  state.contextResolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        contextCalls++;
        if (options.toolChoice?.type === "none")
          return {
            ...jsonResponse({}),
            content: [
              {
                type: "text" as const,
                text: "a.ts:1 captures the relevant declaration.",
              },
            ],
          };
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: `read-${contextCalls}`,
              toolName: "readSource",
              input: JSON.stringify({
                path: "a.ts",
                start: 1,
                end: 1,
                side: "after",
              }),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
  };
  state.resolved = {
    model: new MockLanguageModelV4({
      doGenerate: async (options) => {
        const results = options.prompt.filter(
          (message) => message.role === "tool",
        );
        if (results.length) {
          expect(JSON.stringify(results)).toContain(
            "captures the relevant declaration",
          );
          return jsonResponse(resultGroups);
        }
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "context",
              toolName: "askContext",
              input: JSON.stringify({ query: "Inspect a.ts" }),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage: resultUsage,
          warnings: [],
        };
      },
    }),
  };
  const selection = {
    connectionId: "connection",
    modelId: "model",
    name: "Model",
  };
  const agent = await createRepositoryAgent({
    local: {} as never,
    snapshot: {
      id: "snapshot",
      source: {},
      files: [{ path: "a.ts", diff: "patch" }],
    } as never,
    settings: {
      ...defaultAiSettings,
      separate: true,
      roles: {
        review: null,
        explain: null,
        grouping: selection,
        context: { ...selection, modelId: "context" },
      },
    },
    selection,
    context: {
      sources: { "a.ts": "export const value = 1;" },
      analysis: {
        edges: [],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    signal: new AbortController().signal,
  });
  await expect(agent.grouping()).resolves.toEqual(resultGroups);
  expect(contextCalls).toBe(4);
});
