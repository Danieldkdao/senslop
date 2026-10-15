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

test("grouping constrains each request to its batch and orders with compact file references", async () => {
  const selected = Array.from({ length: 12 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files")) {
        expect(
          (options.tools ?? [])
            .filter((tool) => tool.type === "function")
            .map((tool) => tool.name),
        ).toEqual([]);
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Definitions first",
              files: selected.map((_, index) => index),
            },
          ],
        });
      }
      const input = batch(options);
      expect(input.changes.length).toBeLessThanOrEqual(8);
      const schema = options.responseFormat as unknown as {
        schema: {
          properties: {
            groups: {
              items: {
                properties: {
                  files: {
                    items: { properties: { path: { enum: string[] } } };
                  };
                };
              };
            };
          };
        };
      };
      expect(
        schema.schema.properties.groups.items.properties.files.items.properties
          .path.enum,
      ).toEqual(input.changes.map((file) => file.path));
      const prompt = options.prompt
        .flatMap((message) => (message.role === "user" ? message.content : []))
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      const context = JSON.parse(
        prompt.match(/Snapshot context:\n([^\n]+)/)![1]!,
      ) as { changes: { path: string }[] };
      expect(context.changes.map((file) => file.path)).toEqual(
        input.changes.map((file) => file.path),
      );
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: input.changes.map((file) => ({
              path: file.path,
              summary: "Changes value",
              related: [],
            })),
          },
        ],
      });
    },
  });
  const grouped = await (await agent(selected)).grouping();
  expect(
    grouped.groups.flatMap((group) => group.files.map((file) => file.path)),
  ).toEqual(selected.map((file) => file.path));
});

test("grouping repairs only duplicated membership in a structured result", async () => {
  const selected = files
    .slice(0, 2)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Repair input:")) {
        expect(batch(options).changes.map((file) => file.path)).toEqual([
          "0.ts",
        ]);
        return response({
          groups: [],
          files: [
            {
              path: "0.ts",
              summary: "Corrected",
              related: [],
              groupIndex: 0,
              beforePath: "1.ts",
            },
          ],
        });
      }
      const members = batch(options).changes.map((file) => ({
        path: file.path,
        summary: "KEEP",
        related: [],
      }));
      return response({
        groups: [
          {
            title: "Definitions",
            rationale: "Change",
            files: [...members, members[0]],
          },
        ],
      });
    },
  });
  const grouped = await (await agent(selected)).grouping();
  expect(grouped.groups[0]!.files.map((file) => file.path)).toEqual([
    "0.ts",
    "1.ts",
  ]);
  expect(grouped.groups[0]!.files[1]!.summary).toBe("KEEP");
  expect(requests).toHaveLength(2);
});

test("persistent duplicate grouping stops after two targeted repairs and logs no source", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      return response({
        groups: [
          {
            title: "Private source",
            rationale: "Private rationale",
            files: [0, 0].map(() => ({
              path: "0.ts",
              summary: "Private summary",
              related: [],
            })),
          },
        ],
      });
    },
  });
  await expect(
    (
      await agent(
        files.slice(0, 2).map((file) => ({ ...file, diff: "small patch" })),
      )
    ).grouping(),
  ).rejects.toThrow("unresolved defects");
  expect(requests).toHaveLength(6);
  expect(log.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(log.mock.calls)).not.toContain("Private");
});

test.each(["duplicate", "missing", "unknown"])(
  "final ordering repairs %s file IDs without reanalyzing successful batches",
  async (failure) => {
    const selected = Array.from({ length: 9 }, (_, index) => ({
      ...files[0]!,
      path: `${index}.ts`,
      diff: "small patch",
    }));
    let ordering = 0;
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        if (text(options).includes("Repair input:")) {
          ordering++;
          return response({
            groups: [],
            files: [{ path: "0.ts", groupIndex: 0, beforePath: "1.ts" }],
          });
        }
        if (text(options).includes("Order these prepared files")) {
          ordering++;
          const ids = selected.map((_, index) => index);
          if (ordering === 1) {
            switch (failure) {
              case "duplicate":
                ids.unshift(0);
                break;
              case "missing":
                ids.shift();
                break;
              case "unknown":
                ids[0] = 1999;
                break;
            }
          }
          return response({
            groups: [
              {
                title: "Flow",
                rationale: "Change",
                files: ids,
              },
            ],
          });
        }
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: batch(options).changes.map((file) => ({
                path: file.path,
                summary: "Changes value",
                related: [],
              })),
            },
          ],
        });
      },
    });
    const grouped = await (await agent(selected)).grouping();
    expect(
      grouped.groups.flatMap((group) => group.files.map((file) => file.path)),
    ).toEqual(selected.map((file) => file.path));
    expect(requests).toHaveLength(4);
    expect(ordering).toBe(2);
  },
);

test("cancellation during grouping correction prevents another provider request", async () => {
  const abort = new AbortController();
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      abort.abort();
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: [0, 0].map(() => ({
              path: "0.ts",
              summary: "Changes value",
              related: [],
            })),
          },
        ],
      });
    },
  });
  await expect(
    (
      await agent(
        files.slice(0, 2).map((file) => ({ ...file, diff: "small patch" })),
        undefined,
        undefined,
        abort.signal,
      )
    ).grouping(),
  ).rejects.toThrow();
  expect(requests).toHaveLength(1);
});

test.each(["completion", "partial-json"])(
  "a truncated %s response splits only the failed batch and discards partial output",
  async (failure) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const selected = files
      .slice(0, 2)
      .map((file) => ({ ...file, diff: "small patch" }));
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        if (text(options).includes("Order these prepared files"))
          return response({
            groups: [{ title: "Flow", rationale: "Change", files: [0, 1] }],
          });
        const input = batch(options);
        if (input.changes.length > 1) {
          return {
            ...response({}),
            content: [
              {
                type: "text",
                text:
                  failure === "partial-json"
                    ? '{"groups":'
                    : "TEST_PRIVATE_PARTIAL_OUTPUT",
              },
            ],
            finishReason: { unified: "length", raw: "length" },
          };
        }
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: input.changes.map((file) => ({
                path: file.path,
                summary: "Complete summary",
                related: [],
              })),
            },
          ],
        });
      },
    });
    const grouped = await (await agent(selected)).grouping();
    expect(
      grouped.groups.flatMap((group) => group.files.map((file) => file.path)),
    ).toEqual(selected.map((file) => file.path));
    expect(requests).toHaveLength(4);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      failure === "partial-json" ? '{"groups":' : "TEST_PRIVATE_PARTIAL_OUTPUT",
    );
  },
);

test("a truncated single-file fragment is split with absolute offsets and complete diff coverage", async () => {
  const selected = {
    ...files[0]!,
    diff: "line of changed code\n".repeat(12000),
  };
  const successful: {
    path: string;
    diff: string;
    offset?: number;
    total?: number;
  }[] = [];
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const input = batch(options);
      if (input.changes.some((file) => file.diff.length > 20000))
        return {
          ...response({}),
          finishReason: { unified: "length", raw: "length" },
        };
      successful.push(...input.changes);
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: [
              { path: selected.path, summary: "Combined changes", related: [] },
            ],
          },
        ],
      });
    },
  });
  await expect((await agent([selected])).grouping()).resolves.toMatchObject({
    groups: [{ files: [{ path: selected.path, summary: "Combined changes" }] }],
  });
  expect(successful.map((file) => file.diff).join("")).toBe(selected.diff);
  let offset = 0;
  for (const file of successful) {
    expect(file.offset).toBe(offset);
    expect(file.total).toBe(selected.diff.length);
    offset += file.diff.length;
  }
});

test("persistent truncation stops after bounded splitting instead of looping or publishing partial results", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      return {
        ...response({}),
        finishReason: { unified: "length", raw: "length" },
      };
    },
  });
  await expect(
    (await agent([{ ...files[0]!, diff: "tiny" }])).grouping(),
  ).rejects.toThrow(/completion budget/);
  expect(requests.length).toBeGreaterThan(1);
  expect(requests.length).toBeLessThanOrEqual(4);
});
beforeEach(() => {
  requests.splice(0);
  state.contextWindow = 64000;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("large grouping uses bounded source batches and a global ordering pass with complete coverage", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Definitions first",
              files: files.map((_, index) => index),
            },
          ],
        });
      const input = batch(options);
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: input.changes.map((file) => ({
              path: file.path,
              summary: "Changes value",
              related: file.path === "0.ts" ? ["1.ts"] : [],
            })),
          },
        ],
      });
    },
  });
  const result = await (await agent()).grouping();
  expect(requests.length).toBeGreaterThan(2);
  expect(
    result.groups.flatMap((group) => group.files.map((file) => file.path)),
  ).toEqual(files.map((file) => file.path));
  expect(result.groups[0]!.files[0]!.related).toEqual(["1.ts"]);
  for (const request of requests.slice(0, -1)) {
    const prompt = text(request);
    expect(prompt).toContain("snapshot");
    if (
      batch(request).changes.some(
        (file) => file.path === "0.ts" || file.path === "1.ts",
      )
    )
      expect(prompt).toContain("compiler-resolved");
    expect(Buffer.byteLength(prompt)).toBeLessThan(100000);
  }
  const chunks = requests
    .slice(0, -1)
    .flatMap((request) => batch(request).changes);
  for (const file of files)
    expect(
      chunks
        .filter((chunk) => chunk.path === file.path)
        .map((chunk) => chunk.diff)
        .join(""),
    ).toBe(file.diff);
});

test("one oversized file is split without losing diff text and carries its earlier summary", async () => {
  const huge = { ...files[0]!, diff: files[0]!.diff.repeat(5) };
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const input = batch(options);
      if (requests.length > 1)
        expect(input.previousSummaries?.[0]?.summary).toBe("Summary so far");
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: [
              { path: huge.path, summary: "Summary so far", related: [] },
            ],
          },
        ],
      });
    },
  });
  const result = await (await agent([huge])).grouping();
  expect(requests.length).toBeGreaterThan(1);
  expect(
    requests
      .flatMap((request) => batch(request).changes)
      .map((change) => change.diff)
      .join(""),
  ).toBe(huge.diff);
  expect(result.groups.flatMap((group) => group.files)).toHaveLength(1);
});
