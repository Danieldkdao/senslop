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
