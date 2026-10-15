import { afterEach, expect, test, vi } from "vitest";
import { APICallError } from "ai";
import { createRequestLimiter } from "../request-limiter";
import { getAiProviderBackoff } from "../errors";

afterEach(() => vi.useRealTimers());
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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
