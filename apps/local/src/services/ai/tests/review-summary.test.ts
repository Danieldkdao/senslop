import { expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { generateReviewSummary } from "../review-summary";
import type { FindingSchema } from "../../../features/agents/schemas";

vi.mock("server-only", () => ({}));
const finding: FindingSchema = {
  severity: "high",
  title: "Null input crashes startup",
  problem: "Opening a workspace without an input crashes startup.",
  path: "startup.ts",
  side: "after",
  start: 1,
  end: 1,
  code: "input.value",
  fixPrompt: "Guard the input.",
};
const response = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  warnings: [],
  usage: {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
  },
});
const setup = (value: unknown) => {
  const request = vi.fn(async () => response(value));
  return {
    request,
    config: {
      findings: [finding],
      model: new MockLanguageModelV4({ doGenerate: request }),
      signal: new AbortController().signal,
      contextWindow: 32000,
    },
  };
};
test("summary generation uses validated issues and is skipped entirely without findings", async () => {
  const { request, config } = setup({
    summary: "Fix the startup crash before merging.",
  });
  expect(
    await generateReviewSummary({ ...config, findings: [] }),
  ).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  expect(await generateReviewSummary(config)).toBe(
    "Fix the startup crash before merging.",
  );
  expect(JSON.stringify(request.mock.calls)).toContain(finding.problem);
});

test("summary requests require a sentence and expose the JSON contract to schema-less adapters", async () => {
  const { config } = setup({});
  const summary = "Fix the startup crash before merging.";
  const request = vi.fn<MockLanguageModelV4["doGenerate"]>(async () =>
    response({ summary }),
  );
  const result = await generateReviewSummary({
    ...config,
    model: new MockLanguageModelV4({ doGenerate: request }),
  });
  const options = request.mock.calls[0]![0];
  expect(
    options.prompt
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n"),
  ).toContain('Return a JSON object with a required "summary" string');
  expect(options.responseFormat).toMatchObject({
    type: "json",
    schema: { required: ["summary"] },
  });
  expect(result).toBe(summary);
});
test.each([{}, { summary: 123 }, { summary: "x".repeat(1000) }])(
  "a missing or invalid optional summary leaves findings usable: %j",
  async (value) => {
    expect(await generateReviewSummary(setup(value).config)).toBeUndefined();
  },
);
test("provider failures do not retry or fail the review", async () => {
  const { config } = setup({});
  const request = vi.fn(async () => {
    throw new Error("Provider unavailable");
  });
  expect(
    await generateReviewSummary({
      ...config,
      model: new MockLanguageModelV4({ doGenerate: request }),
    }),
  ).toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
});
test("oversized optional summaries skip the request and cancellation still stops work", async () => {
  const { request, config } = setup({});
  expect(
    await generateReviewSummary({ ...config, contextWindow: 100 }),
  ).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  const abort = new AbortController();
  abort.abort();
  await expect(
    generateReviewSummary({ ...config, signal: abort.signal }),
  ).rejects.toThrow();
});

test("native-agent providers receive a single tool-free summary turn", async () => {
  const { config } = setup({
    summary: "Fix the startup crash before merging.",
  });
  const createModel = vi.fn(() => config.model);
  expect(await generateReviewSummary({ ...config, createModel })).toBe(
    "Fix the startup crash before merging.",
  );
  expect(createModel).toHaveBeenCalledWith({}, 1, config.signal);
});
test("a stalled optional summary times out without failing the review", async () => {
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
  try {
    const { config } = setup({});
    let onStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      onStarted = resolve;
    });
    const request = vi.fn(
      ({ abortSignal }: Parameters<MockLanguageModelV4["doGenerate"]>[0]) =>
        new Promise<never>((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(abortSignal.reason),
            { once: true },
          );
          onStarted();
        }),
    );
    const summary = generateReviewSummary({
      ...config,
      model: new MockLanguageModelV4({ doGenerate: request }),
    });
    await started;
    await vi.advanceTimersByTimeAsync(15001);
    expect(await summary).toBeUndefined();
    expect(timeout).toHaveBeenCalledWith(15000);
    expect(request).toHaveBeenCalledOnce();
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
