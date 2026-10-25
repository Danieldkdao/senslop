import { beforeEach, expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { APICallError } from "ai";
import { createRepositoryAgent } from "../repository-agent";
import { defaultAiSettings } from "../../../features/agents/constants";
import { staticReviewLimitation } from "../../../features/agents/lib/review-limitations";
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
  provider: undefined as "lm-studio" | undefined,
  capacity: {} as typeof defaultAiSettings.capacity,
}));
vi.mock("../../../features/providers/lib/provider-service", () => ({
  ProviderService: class {
    resolve = async () => ({
      connection: {
        contextWindow: state.contextWindow,
        provider: state.provider,
      },
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
  intent?: Parameters<typeof createRepositoryAgent>[0]["reviewIntent"],
) =>
  createRepositoryAgent({
    reviewIntent: intent ?? {
      brief: null,
      instructions: {
        profiles: ["correctness"],
        rules: [],
        sources: [],
        limitations: [],
      },
    },
    local: {
      database: {
        prepare: (query: string) => ({
          get: () =>
            query.startsWith("SELECT repository")
              ? { repository: "/fixture" }
              : undefined,
        }),
      },
    } as never,
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
      capacity: state.capacity,
    },
    selection: { connectionId: "connection", modelId: "model", name: "Model" },
    signal,
    checkpoint,
    executionPolicy,
    groupingSeed,
  });

test.each(["active", "stalled", "silent", "endless"] as const)(
  "chat stream timeout policy preserves %s response behavior",
  async (mode) => {
    vi.useFakeTimers();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException("Timed out", "TimeoutError")),
          milliseconds,
        );
        return controller.signal;
      });
    const abort = new AbortController();
    state.model = new MockLanguageModelV4({
      doStream: async (options) => {
        requests.push(options);
        let timer: ReturnType<typeof setInterval> | undefined;
        return {
          stream: new ReadableStream({
            start(controller) {
              if (mode === "silent") return;
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: "Started. ",
              });
              if (mode === "stalled") return;
              let chunks = 0;
              timer = setInterval(() => {
                controller.enqueue({
                  type: "text-delta",
                  id: "text",
                  delta: `Part ${++chunks}. `,
                });
                if (mode === "endless" || chunks !== 6) return;
                clearInterval(timer);
                controller.enqueue({ type: "text-end", id: "text" });
                controller.enqueue({
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage,
                });
                controller.close();
              }, 30000);
            },
            cancel() {
              clearInterval(timer);
            },
          }),
        };
      },
    });
    const reviewer = await agent(files, undefined, undefined, abort.signal);
    const generation = reviewer.stream([
      { role: "user", content: "Explain the changes" },
    ]);
    const parts: { type: string; reason?: string }[] = [];
    const drained = (async () => {
      for await (const part of generation.stream) parts.push(part);
    })();
    try {
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(
        mode === "endless" ? 16 * 60 * 1000 : 240100,
      );
      expect(parts.some((part) => part.type === "abort")).toBe(
        mode !== "active",
      );
      if (mode === "active")
        expect(parts).toContainEqual(
          expect.objectContaining({ type: "finish", finishReason: "stop" }),
        );
      else
        expect(parts).toContainEqual(
          expect.objectContaining({
            type: "abort",
            reason: expect.stringMatching(/timeout/i),
          }),
        );
    } finally {
      abort.abort();
      await drained;
      timeout.mockRestore();
      vi.useRealTimers();
    }
  },
);

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

test.each([64000, null])(
  "local review batches with context %s carry only their file inventory and adjacent dependency context",
  async (contextWindow) => {
    state.contextWindow = contextWindow;
    state.provider = "lm-studio";
    const selected = Array.from({ length: 40 }, (_, index) => ({
      ...files[0]!,
      path: `${index}.ts`,
      diff: "context ".repeat(1500),
    }));
    const edges = selected.slice(0, -1).map((file, index) => ({
      from: file.path,
      to: selected[index + 1]!.path,
      specifier: "./next",
      typeOnly: false,
      provenance: "compiler-resolved" as const,
    }));
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        const input = batch(options);
        const prompt = options.prompt
          .filter((message) => message.role === "user")
          .flatMap((message) => message.content)
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        const context = JSON.parse(
          prompt.match(/Snapshot context:\n([^\n]+)/)![1]!,
        ) as {
          changes: { path: string }[];
          dependencies: typeof edges;
        };
        const members = input.changes.map((file) => file.path);
        expect(context.changes.map((file) => file.path)).toEqual(members);
        expect(context.dependencies).toEqual(
          edges.filter(
            (edge) => members.includes(edge.from) || members.includes(edge.to),
          ),
        );
        return response({
          files: members.map((path) => ({ path, findings: [] })),
          limitations: [],
        });
      },
    });
    const result = await (
      await agent(selected, undefined, {
        edges,
        symbols: [],
        diagnostics: [],
        cycles: [],
        limitations: [],
      })
    ).review();
    expect(result.findings).toEqual([]);
    expect(requests.length).toBeGreaterThan(1);
    const reviewed = requests.flatMap((request) => batch(request).changes);
    expect([...new Set(reviewed.map((file) => file.path))].sort()).toEqual(
      selected.map((file) => file.path).sort(),
    );
    for (const file of selected)
      expect(
        reviewed
          .filter((part) => part.path === file.path)
          .map((part) => part.diff)
          .join(""),
      ).toBe(file.diff);
  },
);

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
  state.capacity = {};
  requests.splice(0);
  state.contextWindow = 64000;
  state.provider = undefined;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("saved capacity bounds batch input and output and is copied when the run starts", async () => {
  state.capacity = {
    connection: {
      concurrency: 1,
      requestsPerMinute: null,
      inputTokensPerMinute: null,
      outputTokensPerMinute: null,
      contextTokens: 64000,
      outputTokens: 2048,
      groupingInputTokens: 1024,
      reviewInputTokens: 4096,
    },
  };
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: files.map((_, id) => id),
            },
          ],
        });
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
  const run = await agent(
    files.map((file) => ({ ...file, diff: "small ".repeat(700) })),
    undefined,
    undefined,
    undefined,
    undefined,
    {},
  );
  state.capacity.connection!.outputTokens = 64000;
  state.capacity.connection!.groupingInputTokens = 128000;
  await run.grouping();
  expect(requests.length).toBeGreaterThan(6);
  for (const request of requests)
    expect(request.maxOutputTokens).toBeLessThanOrEqual(2048);
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

test("large reviews validate merged evidence and remove duplicate findings across batches", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (
        JSON.stringify(options.prompt).includes(
          "Summarize the supplied code review findings",
        )
      )
        return response({ summary: "Fix the changed value before merging." });
      const finding = {
        severity: "high",
        title: "Value changed incorrectly",
        problem: "Caller requires zero",
        path: "0.ts",
        side: "after",
        start: 1,
        end: 1,
        code: files[0]!.after,
        fixPrompt: "Restore zero and test the caller",
      };
      return response({
        files: batch(options).changes.map((file) => ({
          path: file.path,
          findings: file.path === finding.path ? [finding] : [],
        })),
        limitations: [],
      });
    },
  });
  const result = await (await agent()).review();
  expect(requests.length).toBeGreaterThan(1);
  expect(result.findings).toHaveLength(1);
  expect(result.summary).toBe("Fix the changed value before merging.");
  expect(result.findings[0]!.fixPrompt).toContain("Path: 0.ts");
  expect(result.findings[0]!.fixPrompt).toContain("Restore zero");
  for (const request of requests)
    expect(Buffer.byteLength(text(request))).toBeLessThan(100000);
});

test("reviews preserve all batch and context limitations and can restore them from checkpoints", async () => {
  const saved = new Map<string, unknown>();
  const checkpoint = {
    read: (key: string) => saved.get(key),
    write: (key: string, value: unknown) => {
      saved.set(key, value);
    },
  };
  const expected = new Set<string>([
    "Compiler context unavailable",
    staticReviewLimitation,
  ]);
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const changes = batch(options).changes;
      const limitations = Array.from(
        { length: 30 },
        (_, index) => `${changes[0]!.path}: evidence limitation ${index}`,
      );
      limitations.forEach((entry) => expected.add(entry));
      return response({
        files: changes.map(({ path }) => ({ path, findings: [] })),
        limitations,
      });
    },
  });
  const analysis = {
    edges: [],
    symbols: [],
    diagnostics: [],
    cycles: [],
    limitations: ["Compiler context unavailable"],
  };
  const first = await (
    await agent(files, undefined, analysis, undefined, checkpoint)
  ).review();
  expect(expected.size).toBeGreaterThan(30);
  expect(new Set(first.limitations)).toEqual(expected);
  // Completed results must survive the same validation used by persistence.
  expect(correctnessSchema.parse(first)).toEqual(first);
  const calls = requests.length;
  const restored = await (
    await agent(files, undefined, analysis, undefined, checkpoint)
  ).review();
  expect(restored).toEqual(first);
  expect(requests).toHaveLength(calls);
});

test("merged reviews retain more than one response's finding limit and persist Markdown prompts with verified locations", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) =>
      response({
        files: batch(options).changes.map(({ path }) => ({
          path,
          findings: Array.from({ length: 60 }, (_, index) => ({
            severity: "high",
            title: `Verified issue ${index}`,
            problem: "Caller requires zero",
            path,
            side: "after",
            start: 1,
            end: 1,
            code: files[0]!.after,
            fixPrompt: index
              ? "Verify the caller before editing."
              : "x".repeat(10000),
          })),
        })),
        limitations: [],
      }),
  });
  const result = await (await agent()).review();
  expect(result.findings).toHaveLength(360);
  expect(
    result.findings.some((finding) => finding.fixPrompt.length > 10000),
  ).toBe(true);
  expect(
    result.findings.every((finding) =>
      finding.fixPrompt.includes("**Suggested fix**"),
    ),
  ).toBe(true);
  expect(correctnessSchema.parse(result)).toEqual(result);
});

test("missing review assessments narrow into smaller requests instead of failing the entire review", async () => {
  const selected = Array.from({ length: 18 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  let singleFileCalls = 0;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Repair input:"))
        return response({ files: [], findings: [], limitations: [] });
      const changes = batch(options).changes;
      if (changes.length === 1) singleFileCalls++;
      return response({
        files: changes.slice(0, 1).map(({ path }) => ({ path, findings: [] })),
        limitations: [],
      });
    },
  });
  const result = await (await agent(selected)).review();
  expect(result.findings).toEqual([]);
  expect(result.limitations).toEqual([staticReviewLimitation]);
  expect(singleFileCalls).toBeGreaterThan(0);
  expect(requests.length).toBeLessThan(80);
});

test("review requests name the exact expected paths and finding repairs accept explicit retractions", async () => {
  const selected = files
    .slice(0, 2)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Repair input:")) {
        expect(text(options)).toContain("never a bare null array entry");
        expect(text(options)).not.toContain(
          "Return one files assessment per batch path",
        );
        return response({
          files: [],
          findings: [{ id: "finding-0", finding: null }],
          limitations: [],
        });
      }
      const schema = JSON.stringify(options.responseFormat);
      expect(schema).toContain('"enum":["0.ts","1.ts"]');
      return response({
        files: selected.map(({ path }, index) => ({
          path,
          findings: index
            ? []
            : [
                {
                  severity: "high",
                  title: "Unsupported",
                  problem: "Unsupported",
                  path,
                  side: "after",
                  start: 1,
                  end: 1,
                  code: "invented",
                  fixPrompt: "Verify",
                },
              ],
        })),
        limitations: [],
      });
    },
  });
  const result = await (await agent(selected)).review();
  expect(result.findings).toEqual([]);
  expect(result.limitations).toEqual([staticReviewLimitation]);
  expect(requests).toHaveLength(2);
});

test("schema complexity rejections narrow the review without losing any file assessments", async () => {
  const selected = Array.from({ length: 26 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  const assessed: string[] = [];
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const changes = batch(options).changes;
      if (changes.length > 2)
        throw new APICallError({
          message:
            "The specified schema produces a constraint that has too many states for serving.",
          url: "https://example.test/generateContent",
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      assessed.push(...changes.map(({ path }) => path));
      return response({
        files: changes.map(({ path }) => ({ path, findings: [] })),
        limitations: [],
      });
    },
  });
  const result = await (await agent(selected)).review();
  expect(result.findings).toEqual([]);
  expect(result.limitations).toEqual([staticReviewLimitation]);
  expect(assessed.sort()).toEqual(selected.map(({ path }) => path).sort());
  expect(requests.length).toBeLessThan(40);
});

test.each([
  [400, "Request contains an invalid argument.", 2],
  [401, "Invalid API key.", 2],
  [400, "Schema contains an unsupported property.", 2],
  [400, "The response schema is too complex.", 1],
])(
  "unrecoverable %i rejections stop without repeating unchanged requests",
  async (statusCode, message, count) => {
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        throw new APICallError({
          message,
          url: "https://example.test/generateContent",
          requestBodyValues: {},
          statusCode,
          isRetryable: false,
        });
      },
    });
    await expect(
      (
        await agent(
          files
            .slice(0, count)
            .map((file) => ({ ...file, diff: "small patch" })),
        )
      ).review(),
    ).rejects.toMatchObject({ statusCode });
    expect(requests).toHaveLength(1);
  },
);

test("a persistently missing single-file assessment fails clearly without claiming a clean review", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      return response({ files: [], findings: [], limitations: [] });
    },
  });
  await expect((await agent(files.slice(0, 1))).review()).rejects.toMatchObject(
    {
      name: "AiReviewRepairError",
      message: expect.stringContaining("File assessment is missing"),
    },
  );
  expect(requests).toHaveLength(3);
});

test("chat on a large snapshot sends a compact manifest and can page frozen diffs", async () => {
  state.model = new MockLanguageModelV4({
    doStream: async (options) => {
      requests.push(options);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "Explanation",
            });
            controller.enqueue({ type: "text-end", id: "text" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            });
            controller.close();
          },
        }),
      };
    },
  });
  const reviewer = await agent();
  const result = reviewer.stream([{ role: "user", content: "Explain 0.ts" }]);
  let explanation = "";
  for await (const part of result.stream)
    if (part.type === "text-delta") explanation += part.text;
  expect(explanation).toBe("Explanation");
  expect(Buffer.byteLength(text(requests[0]!))).toBeLessThan(10000);
  const page = await reviewer.tools.readDiff.execute!(
    { path: "0.ts", offset: 0 },
    { toolCallId: "diff", messages: [], context: {} },
  );
  expect(page).toEqual({
    path: "0.ts",
    offset: 0,
    diff: files[0]!.diff.slice(0, 12000),
    nextOffset: 12000,
  });
});

test("an incomplete analysis batch stops after bounded correction instead of publishing partial coverage", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: [
              { path: "invented.ts", summary: "Unsupported", related: [] },
            ],
          },
        ],
      });
    },
  });
  await expect((await agent()).grouping()).rejects.toThrow(
    /unresolved defects/,
  );
  expect(requests).toHaveLength(3);
});

test("malformed output corrects only the failed batch before global ordering", async () => {
  const selected = Array.from({ length: 9 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  const sourceBatches: string[][] = [];
  let failedBatchCalls = 0;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: selected.map((_, index) => index),
            },
          ],
        });
      const input = batch(options);
      sourceBatches.push(input.changes.map((file) => file.path));
      if (input.changes[0]?.path === "8.ts" && ++failedBatchCalls === 1)
        return {
          ...response({}),
          content: [{ type: "text", text: "This is the last file's summary." }],
        };
      if (failedBatchCalls === 2) expect(options.tools ?? []).toEqual([]);
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
  expect(sourceBatches).toEqual([
    selected.slice(0, 8).map((file) => file.path),
    ["8.ts"],
    ["8.ts"],
  ]);
  expect(requests).toHaveLength(4);
});

test("a 16K model can use the default grouping instructions with smaller requests", async () => {
  state.contextWindow = 16000;
  const selected = files.slice(0, 2);
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: selected.map((_, index) => index),
            },
          ],
        });
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
  const result = await (
    await agent(selected, defaultAiSettings.prompt)
  ).grouping();
  expect(result.groups.flatMap((group) => group.files)).toHaveLength(2);
  for (const request of requests) {
    const estimated =
      Math.ceil(
        Buffer.byteLength(
          JSON.stringify({ prompt: request.prompt, tools: request.tools }),
        ) / 3,
      ) + request.maxOutputTokens!;
    expect(estimated).toBeLessThan(16000);
  }
});

test.each([
  [1, 0],
  [2, 0],
  [5, 0],
  [1, 5],
])(
  "%s review evidence repairs fit a small context and preserve %s accepted findings",
  async (count, acceptedCount) => {
    state.provider = "lm-studio";
    state.contextWindow = 16384;
    const source = Array.from(
      { length: 125 },
      (_, index) => `export const value${index} = ${index};`,
    );
    const selected = [
      {
        ...files[0]!,
        after: source.join("\n"),
        diff: `@@ -1 +1 @@\n-old\n+${source[0]}`,
      },
    ];
    const finding = {
      severity: "high",
      title: "Issue",
      problem: "Verify this specific failure. ".repeat(40),
      path: "0.ts",
      side: "after",
      start: 1,
      end: 1,
      code: "invented code",
      fixPrompt: "Verify the implementation.",
    };
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        if (
          text(options).includes("Summarize the supplied code review findings")
        )
          return response({ summary: "Check the implementation." });
        if (text(options).includes("Repair input:")) {
          expect(text(options)).not.toContain("ALREADY ACCEPTED");
          const input = JSON.parse(
            options.prompt
              .filter((message) => message.role === "user")
              .flatMap((message) => message.content)
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n")
              .split("Repair input:\n")[1]!,
          ) as { pendingFindings: { id: string }[] };
          return response({
            files: [],
            findings: input.pendingFindings.map(({ id }) => ({
              id,
              finding: { ...finding, title: id, code: source[0] },
            })),
            limitations: [],
          });
        }
        return response({
          files: [
            {
              path: "0.ts",
              findings: [
                ...Array.from({ length: acceptedCount }, (_, index) => ({
                  ...finding,
                  title: `ALREADY ACCEPTED ${index}`,
                  code: source[0],
                })),
                ...Array.from({ length: count }, (_, index) => ({
                  ...finding,
                  title: `Issue ${index}`,
                })),
              ],
            },
          ],
          limitations: [],
        });
      },
    });
    const result = await (await agent(selected)).review();
    expect(result.findings).toHaveLength(count + acceptedCount);
    expect(
      requests.filter((request) =>
        text(request).includes("Return one files assessment per batch path"),
      ),
    ).toHaveLength(1);
    expect(
      requests.filter((request) => text(request).includes("Repair input:"))
        .length,
    ).toBeGreaterThan(0);
  },
);

test("invalid review evidence receives bounded repair and explicit limitations without losing other batches", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Repair input:"))
        return response({ files: [], findings: [], limitations: [] });
      return response({
        files: batch(options).changes.map((file) => ({
          path: file.path,
          findings: [
            {
              severity: "high",
              title: "Invented issue",
              problem: "Unsupported",
              path: file.path,
              side: "after",
              start: 1,
              end: 1,
              code: "invented code",
              fixPrompt: "Fix it",
            },
          ],
        })),
        limitations: [],
      });
    },
  });
  const result = await (await agent()).review();
  expect(result.findings).toEqual([]);
  expect(
    result.limitations.filter((item) => item.includes("could not be verified")),
  ).toHaveLength(files.length);
  expect(requests).toHaveLength(files.length * 3);
});

test.each([null, 64000, 1000000])(
  "a large shared dependency graph groups with a %s-token override without a metadata-budget failure",
  async (contextWindow) => {
    state.contextWindow = contextWindow;
    const selected = Array.from({ length: 145 }, (_, index) => ({
      ...files[0]!,
      path: `src/${"feature-section/".repeat(5)}${index}.ts`,
      diff: files[0]!.diff.slice(0, 4000),
    }));
    const edges = Array.from({ length: 244 }, (_, index) => ({
      from: selected[index % selected.length]!.path,
      to: selected[(index + 1) % selected.length]!.path,
      specifier: "./shared-dependency",
      typeOnly: false,
      provenance: "compiler-resolved" as const,
    }));
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        if (text(options).includes("Order these prepared files"))
          return response({
            groups: [
              {
                title: "Flow",
                rationale: "Definitions first",
                files: selected.map((_, index) => index),
              },
            ],
          });
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
    const reviewer = await agent(selected, defaultAiSettings.prompt, {
      edges,
      symbols: [],
      diagnostics: [],
      cycles: [],
      limitations: [],
    });
    const grouped = await reviewer.grouping();
    expect(
      grouped.groups.flatMap((group) => group.files.map((file) => file.path)),
    ).toEqual(selected.map((file) => file.path));
    expect(requests.length).toBeGreaterThan(1);
    for (const request of requests) {
      const estimated =
        Math.ceil(
          Buffer.byteLength(
            JSON.stringify({ prompt: request.prompt, tools: request.tools }),
          ) / 3,
        ) + request.maxOutputTokens!;
      expect(estimated).toBeLessThan((contextWindow ?? 128000) * 0.8);
      expect(text(request)).toContain("compiler-resolved");
    }
  },
);

test("successful batches are retained when a later batch needs smaller requests", async () => {
  const selected = Array.from({ length: 12 }, (_, index) => ({
    ...files[0]!,
    path: `${index}.ts`,
    diff: "small patch",
  }));
  let firstBatchCalls = 0;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: selected.map((_, index) => index),
            },
          ],
        });
      const input = batch(options);
      if (input.changes[0]!.path === "0.ts") firstBatchCalls++;
      if (input.changes[0]!.path === "8.ts" && input.changes.length === 4)
        return {
          ...response({}),
          finishReason: { unified: "length", raw: "length" },
        };
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
  expect(firstBatchCalls).toBe(1);
});

test("cancellation stops before requesting a smaller batch", async () => {
  const abort = new AbortController();
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      abort.abort();
      return {
        ...response({}),
        finishReason: { unified: "length", raw: "length" },
      };
    },
  });
  await expect(
    (
      await agent(files.slice(0, 2), "Group", undefined, abort.signal)
    ).grouping(),
  ).rejects.toThrow(/abort/i);
  expect(requests).toHaveLength(1);
});

test("reviews also narrow truncated batches and merge only validated complete results", async () => {
  const selected = files
    .slice(0, 2)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (batch(options).changes.length > 1)
        return {
          ...response({}),
          finishReason: { unified: "length", raw: "length" },
        };
      return response({
        files: batch(options).changes.map((file) => ({
          path: file.path,
          findings: [],
        })),
        limitations: [],
      });
    },
  });
  await expect((await agent(selected)).review()).resolves.toMatchObject({
    findings: [],
  });
  expect(requests).toHaveLength(3);
});

test("malformed final ordering groups trigger placement-only repair and retain every prepared summary", async () => {
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (text(options).includes("Order these prepared files"))
        return response({ groups: [null] });
      if (text(options).includes("Repair input:"))
        return response({
          groups: [{ index: 0, title: "Flow", rationale: "Change" }],
          files: files.map((file) => ({
            path: file.path,
            groupIndex: 0,
            beforePath: null,
          })),
        });
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: `PREPARED ${file.path}`,
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (await agent()).grouping();
  expect(
    result.groups.flatMap((group) => group.files).map((file) => file.summary),
  ).toEqual(files.map((file) => `PREPARED ${file.path}`));
});

test("reasoning exhaustion during final ordering preserves prepared batches and recovers ordering only", async () => {
  let orderingCalls = 0;
  let sourceCalls = 0;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (text(options).includes("Order these prepared files")) {
        if (++orderingCalls === 1)
          return {
            ...response({}),
            content: [],
            finishReason: { unified: "length", raw: "length" },
            usage: {
              ...usage,
              outputTokens: {
                total: options.maxOutputTokens,
                text: 0,
                reasoning: options.maxOutputTokens,
              },
            },
          };
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Change",
              files: files.map((_, id) => id),
            },
          ],
        });
      }
      sourceCalls++;
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: `PREPARED ${file.path}`,
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (await agent()).grouping();
  expect(
    result.groups.flatMap((group) => group.files).map((file) => file.summary),
  ).toEqual(files.map((file) => `PREPARED ${file.path}`));
  expect(orderingCalls).toBe(2);
  expect(sourceCalls).toBe(12);
});

test("persistent final ordering exhaustion still publishes the validated batch groups", async () => {
  let orderingCalls = 0;
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (text(options).includes("Order these prepared files")) {
        orderingCalls++;
        return {
          ...response({}),
          content: [],
          finishReason: { unified: "length", raw: "length" },
        };
      }
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: `PREPARED ${file.path}`,
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (await agent()).grouping();
  expect(
    result.groups.flatMap((group) => group.files).map((file) => file.path),
  ).toEqual(files.map((file) => file.path));
  expect(
    result.groups.flatMap((group) => group.files).map((file) => file.summary),
  ).toEqual(files.map((file) => `PREPARED ${file.path}`));
  expect(
    result.groups.every((group) => group.rationale.includes("Global ordering")),
  ).toBe(true);
  expect(orderingCalls).toBe(2);
});

test("final ordering does not reserve context for disabled repository tools", async () => {
  state.provider = "lm-studio";
  state.contextWindow = 16384;
  const selected = Array.from({ length: 35 }, (_, index) => ({
    ...files[0]!,
    path: `src/${"segment/".repeat(30)}${index}.ts`,
    diff: "small patch",
  }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files")) {
        expect(options.tools ?? []).toHaveLength(0);
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Globally ordered",
              files: selected.map((_, index) => index),
            },
          ],
        });
      }
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "r".repeat(400),
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: "PREPARED",
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (
    await agent(selected, undefined, undefined, undefined, undefined, {
      groupingMaxFiles: 1,
      groupingSteps: 2,
      groupingOutputTokens: 2048,
      batchConcurrency: 1,
    })
  ).grouping();
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]!.rationale).toBe("Globally ordered");
  expect(result.groups[0]!.files.map((file) => file.path)).toEqual(
    selected.map((file) => file.path),
  );
  expect(requests).toHaveLength(selected.length + 1);
});

test.each(["ordering", "placement repair"])(
  "a local context-budget failure in %s retains every completed batch",
  async (phase) => {
    state.provider = "lm-studio";
    state.contextWindow = 16384;
    const selected = Array.from(
      { length: phase === "ordering" ? 35 : 80 },
      (_, index) => ({
        ...files[0]!,
        path:
          phase === "ordering"
            ? `src/${"segment/".repeat(70)}${index}.ts`
            : `${index}.ts`,
        diff: "small patch",
      }),
    );
    const summary =
      phase === "placement repair" ? "PREPARED ".repeat(50) : "PREPARED";
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        if (text(options).includes("Order these prepared files"))
          return response({
            groups: [{ title: "Partial", rationale: "Ordering", files: [0] }],
          });
        return response({
          groups: [
            {
              title: "Flow",
              rationale: phase === "ordering" ? "r".repeat(400) : "Change",
              files: batch(options).changes.map((file) => ({
                path: file.path,
                summary,
                related: [],
              })),
            },
          ],
        });
      },
    });
    const result = await (
      await agent(selected, undefined, undefined, undefined, undefined, {
        groupingMaxFiles: 1,
        groupingSteps: 2,
        groupingOutputTokens: 2048,
        batchConcurrency: 1,
      })
    ).grouping();
    expect(
      result.groups.flatMap((group) => group.files.map((file) => file.path)),
    ).toEqual(selected.map((file) => file.path));
    expect(
      result.groups.flatMap((group) => group.files.map((file) => file.summary)),
    ).toEqual(selected.map(() => summary));
    expect(requests).toHaveLength(
      selected.length + (phase === "ordering" ? 0 : 1),
    );
    expect(
      result.groups.every((group) =>
        group.rationale.includes("Global ordering"),
      ),
    ).toBe(true);
  },
);

test("canceling final ordering prevents the fallback from publishing prepared groups", async () => {
  const abort = new AbortController();
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (text(options).includes("Order these prepared files")) {
        abort.abort(new Error("Canceled during ordering"));
        return {
          ...response({}),
          content: [],
          finishReason: { unified: "length", raw: "length" },
        };
      }
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Change",
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: "PREPARED",
              related: [],
            })),
          },
        ],
      });
    },
  });
  await expect(
    (await agent(files, undefined, undefined, abort.signal)).grouping(),
  ).rejects.toThrow(/Canceled/);
});

test("cumulative grouping sends only changed files with existing group context and preserves accepted summaries", async () => {
  const selected = files
    .slice(0, 2)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const input = batch(options);
      expect(input.changes.map((change) => change.path)).toEqual(["0.ts"]);
      return response({
        groups: [
          {
            title: "Existing flow",
            rationale: "Placement",
            files: [{ path: "0.ts", summary: "Updated", related: [] }],
          },
        ],
      });
    },
  });
  const retained = {
    groups: [
      {
        title: "Existing flow",
        rationale: "Keep order",
        files: [{ path: "1.ts", summary: "KEEP", related: [] }],
      },
    ],
  };
  const result = await (
    await agent(
      selected,
      "Keep flows",
      undefined,
      undefined,
      undefined,
      { groupingInputTokens: 12000, groupingMaxFiles: 8, batchConcurrency: 2 },
      { context: retained, retained },
    )
  ).grouping();
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]!.files).toEqual([
    { path: "1.ts", summary: "KEEP", related: [] },
    { path: "0.ts", summary: "Updated", related: [] },
  ]);
  expect(JSON.stringify(requests.at(-1)?.prompt)).toContain("Existing flow");
});

test.each(["rationales", "membership", "catalog"])(
  "re-sync fits a small context with large retained %s",
  async (kind) => {
    state.provider = "lm-studio";
    state.contextWindow = 16384;
    const count = kind === "membership" ? 180 : kind === "catalog" ? 120 : 40;
    const selected = Array.from({ length: count }, (_, index) => ({
      ...files[0]!,
      path:
        kind === "membership"
          ? `src/${"segment/".repeat(25)}${index}.ts`
          : `src/flow-${index}/file.ts`,
      diff: "small patch",
    }));
    const groups = Array.from(
      { length: kind === "membership" ? 1 : count },
      (_, index) => ({
        title: `existing-group-${index + 1}`,
        rationale:
          kind === "rationales" ? "OLD RATIONALE ".repeat(80) : "Keep order",
        files: (kind === "membership" ? selected : [selected[index]!]).map(
          ({ path }) => ({ path, summary: `KEEP ${path}`, related: [] }),
        ),
      }),
    );
    const aliases = groups.map(({ title }, index) => ({
      key: title,
      title:
        kind === "catalog"
          ? `Flow ${index} ${"descriptive name ".repeat(10)}`
          : `Flow ${index}`,
    }));
    const changed = new Set([
      selected[0]!.path,
      ...(kind === "catalog" ? [selected.at(-1)!.path] : []),
    ]);
    const retained = {
      groups: groups
        .map((group) => ({
          ...group,
          files: group.files.filter(({ path }) => !changed.has(path)),
        }))
        .filter((group) => group.files.length),
    };
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        const paths = batch(options).changes.map(({ path }) => path);
        expect(paths).toHaveLength(1);
        expect(changed.has(paths[0]!)).toBe(true);
        const groupId =
          kind === "membership"
            ? "existing-group-1"
            : groups[selected.findIndex(({ path }) => path === paths[0])]!
                .title;
        expect(text(options)).toContain(groupId);
        expect(text(options)).not.toContain("OLD RATIONALE");
        return response({
          groups: [
            {
              title: groupId,
              rationale: "Updated placement",
              files: [{ path: paths[0]!, summary: "UPDATED", related: [] }],
            },
          ],
        });
      },
    });
    const result = await (
      await agent(
        selected,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          groupingMaxFiles: 1,
          groupingSteps: 2,
          groupingOutputTokens: 2048,
          batchConcurrency: 1,
        },
        { context: { groups }, retained, aliases },
      )
    ).grouping();
    expect(requests).toHaveLength(changed.size);
    expect(result.groups.map(({ title }) => title)).toEqual(
      aliases.map(({ title }) => title),
    );
    expect(
      result.groups.flatMap((group) => group.files.map(({ path }) => path)),
    ).toEqual(selected.map(({ path }) => path));
    expect(
      result.groups.flatMap((group) =>
        group.files.map(({ summary }) => summary),
      ),
    ).toEqual(
      selected.map(({ path }) =>
        changed.has(path) ? "UPDATED" : `KEEP ${path}`,
      ),
    );
    expect(
      result.groups
        .filter((group) => group.files.every(({ path }) => !changed.has(path)))
        .map(({ rationale }) => rationale),
    ).toEqual(
      groups
        .filter((group) => group.files.every(({ path }) => !changed.has(path)))
        .map(({ rationale }) => rationale),
    );
  },
);

test("chat reserves its final step for an answer after seven tool steps", async () => {
  state.model = new MockLanguageModelV4({
    doStream: async (options) => {
      requests.push(options);
      const final = options.toolChoice?.type === "none";
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: final
                ? "Here is the final answer."
                : "Let me check more source.",
            });
            controller.enqueue({ type: "text-end", id: "text" });
            if (!final)
              controller.enqueue({
                type: "tool-call",
                toolCallId: `read-${requests.length}`,
                toolName: "readSource",
                input: JSON.stringify({ path: "0.ts" }),
              });
            controller.enqueue({
              type: "finish",
              finishReason: {
                unified: final ? "stop" : "tool-calls",
                raw: undefined,
              },
              usage,
            });
            controller.close();
          },
        }),
      };
    },
  });
  const reviewer = await agent();
  let answer = "";
  for await (const part of reviewer.stream([
    { role: "user", content: "Catch me up" },
  ]).stream)
    if (part.type === "text-delta") answer += part.text;
  expect(requests).toHaveLength(8);
  expect(requests.at(-1)?.toolChoice).toEqual({ type: "none" });
  expect(answer).toContain("Here is the final answer.");
});

test("group ordering cannot discard already validated summaries when both placement repairs omit files", async () => {
  const selected = files
    .slice(0, 3)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const properties =
        options.responseFormat?.type === "json"
          ? (options.responseFormat.schema?.properties as Record<
              string,
              unknown
            >)
          : undefined;
      if (properties?.files) return response({ groups: [], files: [] });
      if (text(options).includes("Order these prepared files"))
        return response({
          groups: [
            { title: "Partial ordering", rationale: "First", files: [0] },
          ],
        });
      const input = batch(options);
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Review",
            files: input.changes.map((file) => ({
              path: file.path,
              summary: "Verified summary",
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (
    await agent(selected, undefined, undefined, undefined, undefined, {
      groupingMaxFiles: 1,
      batchConcurrency: 1,
    })
  ).grouping();
  expect(
    result.groups
      .flatMap((group) => group.files.map((file) => file.path))
      .sort(),
  ).toEqual(["0.ts", "1.ts", "2.ts"]);
  expect(
    result.groups.some((group) =>
      /ordering could not complete/.test(group.rationale),
    ),
  ).toBe(true);
});

test.each([3, 10])(
  "incomplete grouping of %i files narrows down to individual files instead of losing the entire review",
  async (count) => {
    state.contextWindow = 128000;
    const selected = Array.from({ length: count }, (_, index) => ({
      ...files[0]!,
      path: `${index}.ts`,
      diff: "small patch",
    }));
    let smallCalls = 0;
    state.model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push(options);
        const properties =
          options.responseFormat?.type === "json"
            ? (options.responseFormat.schema?.properties as Record<
                string,
                unknown
              >)
            : undefined;
        if (properties?.files) return response({ groups: [], files: [] });
        if (text(options).includes("Order these prepared files"))
          return response({
            groups: [
              {
                title: "Flow",
                rationale: "Review",
                files: selected.map((_, index) => index),
              },
            ],
          });
        const input = batch(options);
        if (input.changes.length === 1) smallCalls++;
        return response({
          groups: [
            {
              title: "Flow",
              rationale: "Review",
              files: input.changes.slice(0, 1).map((file) => ({
                path: file.path,
                summary: "Verified summary",
                related: [],
              })),
            },
          ],
        });
      },
    });
    const result = await (
      await agent(selected, undefined, undefined, undefined, undefined, {
        groupingInputTokens: 32000,
        groupingMaxFiles: 12,
        groupingOutputTokens: 16000,
        groupingSteps: 2,
        batchConcurrency: 1,
      })
    ).grouping();
    expect(
      result.groups
        .flatMap((group) => group.files.map((file) => file.path))
        .sort(),
    ).toEqual(selected.map((file) => file.path).sort());
    expect(batch(requests[0]!).changes).toHaveLength(count);
    expect(smallCalls).toBe(count);
  },
);

test("malformed final ordering JSON retains validated groups after bounded format correction", async () => {
  const selected = files
    .slice(0, 3)
    .map((file) => ({ ...file, diff: "small patch" }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      if (text(options).includes("Order these prepared files"))
        return {
          ...response({}),
          content: [{ type: "text" as const, text: "{" }],
        };
      return response({
        groups: [
          {
            title: "Flow",
            rationale: "Review",
            files: batch(options).changes.map((file) => ({
              path: file.path,
              summary: "Verified summary",
              related: [],
            })),
          },
        ],
      });
    },
  });
  const result = await (
    await agent(selected, undefined, undefined, undefined, undefined, {
      groupingMaxFiles: 1,
      batchConcurrency: 1,
    })
  ).grouping();
  expect(
    result.groups.flatMap((group) => group.files.map((file) => file.path)),
  ).toEqual(["0.ts", "1.ts", "2.ts"]);
  expect(requests).toHaveLength(5);
});

test("review batches share rule text once and include only their own path assignments", async () => {
  const sharedText = "SHARED-RULE-TEXT-" + "x".repeat(12000);
  const selected = Array.from({ length: 60 }, (_, index) => ({
    ...files[0]!,
    path: `file-${index}.ts`,
    diff: "@@ -1 +1 @@\n-old\n+new\n",
  }));
  state.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      const prompt = options.prompt
        .filter((message) => message.role === "user")
        .flatMap((message) => message.content)
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      const directions = JSON.parse(
        prompt.match(
          /Explicit selected review coverage and rules:\n([^\n]+)/,
        )![1]!,
      );
      const members = batch(options).changes.map((file) => file.path);
      expect(
        directions.files.map((file: { path: string }) => file.path),
      ).toEqual([...new Set(members)]);
      expect(directions.rules).toHaveLength(1);
      expect(prompt.split("SHARED-RULE-TEXT-")).toHaveLength(2);
      return response({
        files: members.map((path) => ({ path, findings: [] })),
        limitations: [],
      });
    },
  });
  const instance = await agent(
    selected,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      brief: null,
      instructions: {
        profiles: ["correctness"],
        sources: [],
        limitations: [],
        rules: [
          {
            id: "shared",
            text: sharedText,
            paths: ["**/*"],
            enabled: true,
            source: "guide.md",
            scope: "",
            precedence: 1,
          },
        ],
      },
    },
  );
  expect((await instance.review()).findings).toEqual([]);
  expect(requests.length).toBeGreaterThan(1);
});
