import { afterEach, expect, test, vi } from "vitest";
import { APICallError } from "ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedRequestCapacity } from "../shared-request-capacity";
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

test("native context requests share the parent request's rolling quota history", async () => {
  vi.useFakeTimers();
  const limiter = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 1,
    allowNestedRequests: true,
    limits: { requestsPerMinute: 2 },
  });
  const child = vi.fn(async () => {});
  const pending = limiter.run(async () => {
    await limiter.run(child);
    await limiter.run(child);
  });
  await vi.advanceTimersByTimeAsync(59999);
  expect(child).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(child).toHaveBeenCalledTimes(2);
});

test("different run policies share endpoint capacity without replacing earlier run limits", async () => {
  const key = crypto.randomUUID();
  const first = getRequestLimiter(key, "lm-studio", {
    concurrency: 1,
    requestsPerMinute: null,
    inputTokensPerMinute: null,
    outputTokensPerMinute: null,
  });
  const nextRun = getRequestLimiter(key, "lm-studio", {
    concurrency: 4,
    requestsPerMinute: null,
    inputTokensPerMinute: null,
    outputTokensPerMinute: null,
  });
  let release!: () => void;
  const pending = first.run(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await pause(1);
  const operation = vi.fn(async () => {});
  const queued = nextRun.run(operation);
  await pause(5);
  expect(operation).not.toHaveBeenCalled();
  release();
  await Promise.all([pending, queued]);
  expect(first.state().concurrency).toBe(1);
  expect(nextRun.state().concurrency).toBeGreaterThan(1);
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

test("shared admission holds through streaming and nested context work reuses its parent's slot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-shared-limiter-"));
  const coordinator = new SharedRequestCapacity(
    join(directory, "capacity.sqlite"),
    1,
  );
  try {
    const limiter = createRequestLimiter({
      initialConcurrency: 1,
      maxConcurrency: 1,
      allowNestedRequests: true,
      shared: { coordinator, key: "endpoint" },
    });
    await limiter.run(async () => {
      await limiter.run(async () => {});
    });
    const stream = await limiter.runStream(async () => ({
      stream: new ReadableStream({ start() {} }),
    }));
    const abort = new AbortController();
    const blocked = coordinator.acquire(
      "other",
      { concurrency: 1, limits: {} },
      0,
      0,
      abort.signal,
    );
    abort.abort();
    await expect(blocked).rejects.toMatchObject({ name: "AbortError" });
    await stream.stream.cancel();
    (
      await coordinator.acquire("other", { concurrency: 1, limits: {} }, 0, 0)
    ).release();
  } finally {
    coordinator.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(["generation", "stream"])(
  "native %s carries its shared slot into a different Context limiter and charges Context quotas",
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-context-slot-"));
    const coordinator = new SharedRequestCapacity(
      join(directory, "capacity.sqlite"),
      1,
    );
    const native = createRequestLimiter({
      initialConcurrency: 1,
      maxConcurrency: 1,
      allowNestedRequests: true,
      shared: { coordinator, key: "native" },
    });
    const context = createRequestLimiter({
      initialConcurrency: 1,
      maxConcurrency: 1,
      limits: { requestsPerMinute: 2 },
      shared: { coordinator, key: "context" },
    });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 500);
    try {
      const retrieve = async () => {
        await context.run(async () => "first evidence", abort.signal, {
          inputTokens: 5,
          outputTokens: 3,
        });
        return context.run(async () => "second evidence", abort.signal, {
          inputTokens: 7,
          outputTokens: 4,
        });
      };
      if (mode === "generation") {
        await expect(native.run(retrieve, abort.signal)).resolves.toBe(
          "second evidence",
        );
      } else {
        const result = await native.runStream(
          async () => ({
            stream: new ReadableStream<string>({
              start(controller) {
                void retrieve().then(
                  (value) => {
                    controller.enqueue(value);
                    controller.close();
                  },
                  (error) => controller.error(error),
                );
              },
            }),
          }),
          abort.signal,
        );
        const reader = result.stream.getReader();
        await expect(reader.read()).resolves.toMatchObject({
          value: "second evidence",
        });
        await reader.read();
      }
      const quotaAbort = new AbortController();
      const excess = coordinator.acquire(
        "context",
        {
          concurrency: 1,
          limits: { requestsPerMinute: 2 },
        },
        0,
        0,
        quotaAbort.signal,
      );
      quotaAbort.abort();
      await expect(excess).rejects.toMatchObject({ name: "AbortError" });
      expect(native.state().active).toBe(0);
      expect(context.state().active).toBe(0);
    } finally {
      clearTimeout(timer);
      abort.abort();
      coordinator.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("native Context can pass unrelated requests already waiting for the parent's shared slot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-context-queue-"));
  const coordinator = new SharedRequestCapacity(
    join(directory, "capacity.sqlite"),
    1,
  );
  const native = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 1,
    allowNestedRequests: true,
    shared: { coordinator, key: "native" },
  });
  const context = createRequestLimiter({
    initialConcurrency: 1,
    maxConcurrency: 1,
    shared: { coordinator, key: "context" },
  });
  let notifyEntered!: () => void;
  let notifyReady!: () => void;
  const entered = new Promise<void>((resolve) => {
    notifyEntered = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    notifyReady = resolve;
  });
  const order: string[] = [];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 500);
  let parent: Promise<unknown> | undefined;
  let unrelated: Promise<unknown> | undefined;
  try {
    parent = native.run(async () => {
      notifyEntered();
      await ready;
      return context.run(async () => {
        order.push("native Context");
      }, abort.signal);
    }, abort.signal);
    await entered;
    unrelated = context.run(async () => {
      order.push("unrelated");
    }, abort.signal);
    await pause(5);
    expect(context.state().active).toBe(1);
    notifyReady();
    await expect(parent).resolves.toBeUndefined();
    await unrelated;
    expect(order).toEqual(["native Context", "unrelated"]);
  } finally {
    notifyReady();
    clearTimeout(timer);
    abort.abort();
    await Promise.allSettled([parent, unrelated]);
    coordinator.close();
    await rm(directory, { recursive: true, force: true });
  }
});
