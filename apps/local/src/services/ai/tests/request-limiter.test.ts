import { afterEach, expect, test, vi } from "vitest";
import { APICallError } from "ai";
import { createRequestLimiter, getRequestLimiter } from "../request-limiter";
import { getAiProviderBackoff } from "../errors";

afterEach(() => vi.useRealTimers());
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

test("output tokens are reserved before admission and reconciled after generation", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    limits: { outputTokensPerMinute: 100 },
  });
  await limiter.run(async () => 20, undefined, {
    outputTokens: 80,
    actualOutputTokens: (result) => result,
  });
  const next = vi.fn(async () => 80);
  await limiter.run(next, undefined, { outputTokens: 80 });
  const third = vi.fn(async () => {});
  const pending = limiter.run(third, undefined, { outputTokens: 1 });
  await vi.advanceTimersByTimeAsync(59999);
  expect(third).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(third).toHaveBeenCalledOnce();
});

test("stream finish usage releases unused input and output reservations", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    limits: { inputTokensPerMinute: 100, outputTokensPerMinute: 100 },
  });
  const stream = await limiter.runStream(
    async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ input: 10, output: 20 });
          controller.close();
        },
      }),
    }),
    undefined,
    {
      inputTokens: 80,
      outputTokens: 80,
      actualInputTokens: (chunk) => (chunk as { input: number }).input,
      actualOutputTokens: (chunk) => (chunk as { output: number }).output,
    },
  );
  const reader = stream.stream.getReader();
  await reader.read();
  await reader.read();
  const operation = vi.fn(async () => {});
  const pending = limiter.run(operation, undefined, {
    inputTokens: 90,
    outputTokens: 80,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(operation).toHaveBeenCalledOnce();
  await pending;
});

test("streaming holds its request slot through consumption and releases on cancellation", async () => {
  const limiter = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 1,
  });
  let controller!: ReadableStreamDefaultController<string>;
  const first = await limiter.runStream(async () => ({
    stream: new ReadableStream<string>({
      start(value) {
        controller = value;
      },
    }),
  }));
  let admitted = false;
  const second = limiter.run(async () => {
    admitted = true;
  });
  await pause(5);
  expect(admitted).toBe(false);
  await first.stream.cancel();
  await second;
  expect(limiter.state().active).toBe(0);
  expect(controller).toBeTruthy();
});

test.each(["generation", "stream"])(
  "native %s can await nested context requests without deadlocking or running children in parallel",
  async (mode) => {
    const limiter = createRequestLimiter({
      initialConcurrency: 1,
      maxConcurrency: 1,
      allowNestedRequests: true,
    });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 1000);
    let active = 0;
    let peak = 0;
    try {
      const operation = async () =>
        Promise.all(
          [1, 2].map((value) =>
            limiter.run(async () => {
              active++;
              peak = Math.max(peak, active);
              await pause(5);
              active--;
              return value;
            }, abort.signal),
          ),
        );
      const result =
        mode === "generation"
          ? limiter.run(operation, abort.signal)
          : (async () => {
              const result = await limiter.runStream(
                async () => ({
                  stream: new ReadableStream<number[]>({
                    start(controller) {
                      void pause(5)
                        .then(operation)
                        .then((value) => {
                          controller.enqueue(value);
                          controller.close();
                        })
                        .catch((error) => controller.error(error));
                    },
                  }),
                }),
                abort.signal,
              );
              const reader = result.stream.getReader();
              const first = await reader.read();
              await reader.read();
              return first.value;
            })();
      await expect(result).resolves.toEqual([1, 2]);
      expect(peak).toBe(1);
      expect(limiter.state().active).toBe(0);
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  },
);

test("healthy queued requests probe higher concurrency without exceeding the ceiling", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    initialConcurrency: 2,
    maxConcurrency: 4,
  });
  let active = 0;
  let peak = 0;
  const operations = Array.from({ length: 30 }, () =>
    limiter.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await pause(10);
      active--;
    }),
  );
  await vi.runAllTimersAsync();
  await Promise.all(operations);
  expect(peak).toBe(4);
  expect(limiter.state()).toMatchObject({
    concurrency: 4,
    active: 0,
    queued: 0,
  });
});

test("waiting batch demand permits safe probes without queuing model requests", async () => {
  const limiter = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 2,
  });
  const releaseDemand = limiter.registerDemand(() => 5);
  let changes = 0;
  const unsubscribe = limiter.subscribe(() => {
    changes++;
  });
  await limiter.run(async () => {});
  await limiter.run(async () => {});
  expect(limiter.state()).toMatchObject({ concurrency: 2, queued: 0 });
  expect(changes).toBe(1);
  releaseDemand();
  unsubscribe();
});

test("a concurrency rejection reduces the queue to one request and honors Retry-After", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    initialConcurrency: 2,
    maxConcurrency: 4,
  });
  const started: number[] = [];
  const operations = Array.from({ length: 5 }, (_, index) =>
    limiter.run(async () => {
      started.push(Date.now());
      await pause(index === 0 ? 10 : 100);
      if (index === 0)
        throw new APICallError({
          message: "Maximum concurrent requests exceeded",
          url: "https://example.test",
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: { "retry-after": "5" },
          isRetryable: true,
        });
    }),
  );
  const results = Promise.allSettled(operations);
  await vi.advanceTimersByTimeAsync(20);
  expect(limiter.state().concurrency).toBe(1);
  expect(started).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(4900);
  expect(started).toHaveLength(2);
  await vi.runAllTimersAsync();
  expect(
    (await results).filter((result) => result.status === "fulfilled"),
  ).toHaveLength(4);
  expect(started[2]! - started[0]!).toBeGreaterThanOrEqual(5000);
  expect(limiter.state().concurrency).toBe(1);
});

test.each([400, undefined])(
  "explicit concurrency messages with status %s become retryable without exposing provider text",
  async (statusCode) => {
    const limiter = createRequestLimiter();
    const error = await limiter
      .run(async () => {
        throw Object.assign(
          new Error("Concurrency limit exceeded TEST_PRIVATE_OUTPUT"),
          { statusCode },
        );
      })
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ statusCode: 429, isRetryable: true });
    expect(JSON.stringify(error)).not.toContain("TEST_PRIVATE");
  },
);

test("unsupported parallel tool settings are not misclassified as concurrency limits", () => {
  expect(
    getAiProviderBackoff(
      Object.assign(
        new Error("Max output tokens cannot be used with parallel tool calls"),
        { statusCode: 400 },
      ),
    ),
  ).toBeNull();
});

test("queued cancellation removes the request before it can reach the provider", async () => {
  const limiter = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 1,
  });
  let release!: () => void;
  const first = limiter.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  const abort = new AbortController();
  const operation = vi.fn(async () => {});
  const queued = limiter.run(operation, abort.signal);
  abort.abort();
  await expect(queued).rejects.toMatchObject({ name: "AbortError" });
  release();
  await first;
  expect(operation).not.toHaveBeenCalled();
  expect(limiter.state()).toMatchObject({ active: 0, queued: 0 });
});

test("ordinary outages pause admission without claiming a concurrency limit", () => {
  expect(
    getAiProviderBackoff(
      Object.assign(new Error("Service unavailable"), { statusCode: 503 }),
    ),
  ).toMatchObject({ kind: "unavailable" });
  expect(
    getAiProviderBackoff(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    ),
  ).toBeNull();
  expect(
    getAiProviderBackoff(
      Object.assign(new Error("Too many requests"), { statusCode: 429 }),
    ),
  ).toMatchObject({ kind: "rate" });
});

test("structured provider concurrency codes are recognized even with a generic HTTP error message", () => {
  const error = new APICallError({
    message: "Bad request",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: 400,
    responseBody: JSON.stringify({
      error: { code: "concurrency_limit_exceeded" },
    }),
  });
  expect(getAiProviderBackoff(error)?.kind).toBe("concurrency");
});

test("input tokens are reserved across concurrent requests and expire after one minute", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    initialConcurrency: 3,
    maxConcurrency: 3,
    limits: { inputTokensPerMinute: 250000 },
  });
  const started: number[] = [];
  const requests = Array.from({ length: 3 }, () =>
    limiter.run(
      async () => {
        started.push(Date.now());
      },
      undefined,
      { inputTokens: 100000 },
    ),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(started).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(59998);
  expect(started).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all(requests);
  expect(started[2]! - started[0]!).toBe(60000);
});

test("request pacing applies even when a model responds immediately", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({ limits: { requestsPerMinute: 2 } });
  const started: number[] = [];
  const requests = Array.from({ length: 3 }, () =>
    limiter.run(async () => {
      started.push(Date.now());
    }),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(started).toHaveLength(2);
  await vi.runAllTimersAsync();
  await Promise.all(requests);
  expect(started[2]! - started[0]!).toBe(60000);
});

test("actual input usage releases unused reservations without ignoring request limits", async () => {
  const limiter = createRequestLimiter({
    limits: { inputTokensPerMinute: 100, requestsPerMinute: 3 },
  });
  await limiter.run(async () => 20, undefined, {
    inputTokens: 80,
    actualInputTokens: (usage) => usage,
  });
  const next = vi.fn(async () => 80);
  await limiter.run(next, undefined, { inputTokens: 80 });
  expect(next).toHaveBeenCalledOnce();
});

test("a request larger than the entire minute allowance fails locally", async () => {
  const limiter = createRequestLimiter({
    limits: { inputTokensPerMinute: 100 },
  });
  const operation = vi.fn(async () => {});
  await expect(
    limiter.run(operation, undefined, { inputTokens: 101 }),
  ).rejects.toThrow(/token.*minute/i);
  expect(operation).not.toHaveBeenCalled();
});

test("cancellation removes requests waiting for the token window", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    limits: { inputTokensPerMinute: 100 },
  });
  await limiter.run(async () => {}, undefined, { inputTokens: 100 });
  const abort = new AbortController();
  const operation = vi.fn(async () => {});
  const pending = limiter.run(operation, abort.signal, { inputTokens: 1 });
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.runAllTimersAsync();
  expect(operation).not.toHaveBeenCalled();
  expect(limiter.state().queued).toBe(0);
});

test("provider retry delays in a structured error body are honored", () => {
  const error = new APICallError({
    message: "Resource exhausted",
    url: "https://example.test",
    requestBodyValues: undefined,
    statusCode: 429,
    responseBody: JSON.stringify({
      error: {
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "45s",
          },
        ],
      },
    }),
  });
  expect(getAiProviderBackoff(error)?.retryAfterMs).toBe(45000);
});
