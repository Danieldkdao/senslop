import { beforeEach, expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { createRepositoryAgent } from "../repository-agent";
import { defaultAiSettings } from "../../../features/agents/constants";
import { correctnessSchema } from "../../../features/agents/schemas";
import type { AnalysisContext } from "../../analysis/types";
import type { AnalysisExecutionPolicy } from "../types";

type LanguageModelV4CallOptions = Parameters<
  MockLanguageModelV4["doGenerate"]
>[0];

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  model: {} as object,
  contextWindow: 64000 as number | null,
}));
vi.mock("../../../features/providers/lib/provider-service", () => ({
  ProviderService: class {
    resolve = async () => ({
      connection: { contextWindow: state.contextWindow },
      secret: null,
    });
  },
}));
vi.mock("../provider-runtime", async () => ({
  ...(await vi.importActual<typeof import("../provider-runtime")>(
    "../provider-runtime",
  )),
  resolveLanguageModel: () => ({ model: state.model }),
}));
vi.mock("../../credentials/os-credentials", () => ({ osCredentials: {} }));

const usage = {
  inputTokens: {
    total: 100,
    noCache: 100,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 100, text: 100, reasoning: undefined },
};
const response = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});
const files = Array.from({ length: 6 }, (_, index) => ({
  path: `${index}.ts`,
  oldPath: null,
  binary: false,
  status: "M" as const,
  before: "export const value = 0;",
  after: "export const value = 1;",
  diff: `@@ -1 +1 @@\n-export const value = 0;\n+export const value = 1;\n ${"context".repeat(6000)}`,
}));
const requests: LanguageModelV4CallOptions[] = [];
const agent = (
  changes = files,
  prompt = "Keep callers after definitions.",
  analysis?: AnalysisContext["analysis"],
  signal = new AbortController().signal,
  checkpoint?: {
    read: (key: string) => unknown;
    write: (key: string, value: unknown) => void;
  },
  executionPolicy: Partial<AnalysisExecutionPolicy> = {
    groupingInputTokens: 12000,
    groupingMaxFiles: 8,
    groupingOutputTokens: 8000,
    groupingSteps: 4,
    batchConcurrency: 1,
  },
  groupingSeed?: Parameters<typeof createRepositoryAgent>[0]["groupingSeed"],
) =>
  createRepositoryAgent({
    local: {} as never,
    snapshot: {
      id: "snapshot",
      source: { kind: "working-tree", base: "base" },
      files: changes,
    } as never,
    context: {
      sources: Object.fromEntries(
        changes.map((file) => [file.path, file.after]),
      ),
      analysis: analysis ?? {
        edges: [
          {
            from: "0.ts",
            to: "1.ts",
            specifier: "./1",
            typeOnly: false,
            provenance: "compiler-resolved",
          },
        ],
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      },
      limitations: [],
    },
    settings: {
      ...defaultAiSettings,
      prompt,
    },
    selection: { connectionId: "connection", modelId: "model", name: "Model" },
    signal,
    checkpoint,
    executionPolicy,
    groupingSeed,
  });

test("larger independent batches reduce request count and overlap without changing coverage", async () => {
  vi.useFakeTimers();
  const selected = Array.from({ length: 24 }, (_, id) => ({
    ...files[0]!,
    path: `${id}.ts`,
    diff: "small patch",
  }));
  const measure = async (policy: Partial<AnalysisExecutionPolicy>) => {
    let active = 0;
    let peak = 0;
    let sourceRequests = 0;
    const startedAt = Date.now();
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        active--;
        if (text(options).includes("Order these prepared files"))
          return response({
            groups: [
              {
                title: "Flow",
                rationale: "Change",
                files: selected.map((_, id) => id),
              },
            ],
          });
        sourceRequests++;
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: batch(options).changes.map((file) => ({
                path: file.path,
                summary: "Change",
                related: [],
              })),
            },
          ],
        });
      },
    });
    const result = (
      await agent(selected, undefined, undefined, undefined, undefined, policy)
    ).grouping();
    await vi.runAllTimersAsync();
    const grouped = await result;
    expect(
      grouped.groups.flatMap((group) => group.files.map((file) => file.path)),
    ).toEqual(selected.map((file) => file.path));
    return { sourceRequests, peak, duration: Date.now() - startedAt };
  };
  try {
    const serial = await measure({ groupingMaxFiles: 8, batchConcurrency: 1 });
    const concurrent = await measure({ batchConcurrency: 2 });
    expect(serial).toMatchObject({ sourceRequests: 3, peak: 1 });
    expect(concurrent).toMatchObject({ sourceRequests: 2, peak: 2 });
    expect(concurrent.duration).toBeLessThan(serial.duration);
  } finally {
    vi.useRealTimers();
  }
});

test("a transient failure resumes validated batches instead of calling their models again", async () => {
  const selected = Array.from({ length: 9 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  const saved = new Map<string, unknown>();
  const checkpoint = {
    read: (key: string) => saved.get(key),
    write: (key: string, value: unknown) => {
      saved.set(key, value);
    },
  };
  const analyzed: string[][] = [];
  let unavailable = true;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: selected.map((_, id) => id),
            },
          ],
        });
      const input = batch(options);
      analyzed.push(input.changes.map((file) => file.path));
      if (input.changes[0]?.path === "8.ts" && unavailable)
        throw new Error("temporarily unavailable");
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: input.changes.map((file) => ({
              path: file.path,
              summary: "Change",
              related: [],
            })),
          },
        ],
      });
    },
  });
  await expect(
    (
      await agent(selected, undefined, undefined, undefined, checkpoint)
    ).grouping(),
  ).rejects.toThrow("temporarily unavailable");
  unavailable = false;
  const result = await (
    await agent(selected, undefined, undefined, undefined, checkpoint)
  ).grouping();
  expect(
    result.groups.flatMap((group) => group.files.map((file) => file.path)),
  ).toEqual(selected.map((file) => file.path));
  expect(analyzed.filter((paths) => paths.includes("0.ts"))).toHaveLength(1);
  expect(analyzed.filter((paths) => paths.includes("8.ts"))).toHaveLength(2);
});
const text = (options: LanguageModelV4CallOptions) =>
  JSON.stringify(options.prompt);
const batch = (options: LanguageModelV4CallOptions) => {
  const prompt = options.prompt
    .flatMap((message) => (message.role === "user" ? message.content : []))
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return JSON.parse(
    prompt.match(/Batch input:\n([^\n]+)/)?.[1] ??
      prompt.split("\nRepair input:\n").at(-1)!,
  ) as {
    changes: { path: string; diff: string; offset?: number }[];
    previousSummaries?: { path: string; summary: string }[];
  };
};
beforeEach(() => {
  requests.splice(0);
  state.contextWindow = 64000;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
