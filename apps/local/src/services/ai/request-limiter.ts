import { APICallError } from "ai";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  getAiErrorStatus,
  getAiProviderBackoff,
  isRetryableAiError,
  AiServiceError,
} from "./errors";
import {
  initialProviderConcurrency,
  maximumAnalysisConcurrency,
  providerRecoveryProbeDelayMs,
  providerRateWindowMs,
  googleRequestLimits,
} from "./constants";
import type { ProviderRequestLimits } from "./types";

export const createRequestLimiter = ({
  initialConcurrency = initialProviderConcurrency,
  maxConcurrency = maximumAnalysisConcurrency,
  allowNestedRequests = false,
  limits = {},
  onChange,
}: {
  initialConcurrency?: number;
  maxConcurrency?: number;
  allowNestedRequests?: boolean;
  limits?: ProviderRequestLimits;
  onChange?: (state: {
    concurrency: number;
    active: number;
    queued: number;
    reason: string;
    delayMs: number;
  }) => void;
} = {}) => {
  let concurrency = Math.max(1, Math.min(initialConcurrency, maxConcurrency));
  let active = 0;
  let successes = 0;
  let pauseUntil = 0;
  let probeAfter = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: { inputTokens: number; start: () => void }[] = [];
  const reservations: { startedAt: number; inputTokens: number }[] = [];
  const subscribers = new Set<() => void>();
  const demands = new Set<() => number>();
  const execution = new AsyncLocalStorage<{
    active: boolean;
    run: typeof run;
  }>();
  const state = () => ({ concurrency, active, queued: queue.length });
  const changed = (reason: string, delayMs: number) => {
    onChange?.({ ...state(), reason, delayMs });
    for (const subscriber of subscribers) subscriber();
  };
  const pump = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!queue.length) return;
    while (active < concurrency && queue.length) {
      const now = Date.now();
      while (
        reservations[0] &&
        reservations[0].startedAt + providerRateWindowMs <= now
      )
        reservations.shift();
      let inputTokens = reservations.reduce(
        (total, entry) => total + entry.inputTokens,
        0,
      );
      let requests = reservations.length;
      let budgetDelay = 0;
      for (const reservation of reservations) {
        if (
          (limits.inputTokensPerMinute === undefined ||
            inputTokens + queue[0]!.inputTokens <=
              limits.inputTokensPerMinute) &&
          (limits.requestsPerMinute === undefined ||
            requests < limits.requestsPerMinute)
        )
          break;
        inputTokens -= reservation.inputTokens;
        requests--;
        budgetDelay = reservation.startedAt + providerRateWindowMs - now;
      }
      const delay = Math.max(pauseUntil - now, budgetDelay);
      if (delay > 0) {
        timer = setTimeout(pump, delay);
        return;
      }
      queue.shift()!.start();
    }
  };
  const acquire = (inputTokens: number, signal?: AbortSignal) =>
    new Promise<{
      release: () => void;
      reservation: { startedAt: number; inputTokens: number };
    }>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const canceled = () => {
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        reject(signal?.reason);
        pump();
      };
      const entry = {
        inputTokens,
        start: () => {
          signal?.removeEventListener("abort", canceled);
          active++;
          const reservation = { startedAt: Date.now(), inputTokens };
          reservations.push(reservation);
          let released = false;
          resolve({
            reservation,
            release: () => {
              if (released) return;
              released = true;
              active--;
              pump();
            },
          });
        },
      };
      signal?.addEventListener("abort", canceled, { once: true });
      queue.push(entry);
      pump();
    });
  const run = async <T>(
    operation: () => PromiseLike<T>,
    signal?: AbortSignal,
    budget: {
      inputTokens?: number;
      actualInputTokens?: (result: T) => number | undefined;
    } = {},
  ): Promise<T> => {
    const parent = allowNestedRequests ? execution.getStore() : undefined;
    if (parent?.active) return parent.run(operation, signal, budget);
    const inputTokens = Math.ceil(budget.inputTokens ?? 0);
    if (
      !Number.isFinite(inputTokens) ||
      inputTokens < 0 ||
      (limits.inputTokensPerMinute !== undefined &&
        inputTokens > limits.inputTokensPerMinute)
    )
      throw new AiServiceError(
        "Estimated request input exceeds the provider's token allowance per minute. Split the request into smaller batches.",
      );
    const { release, reservation } = await acquire(inputTokens, signal);
    const startedAt = Date.now();
    let nestedRun: typeof run | undefined;
    const scope = {
      active: true,
      // Native MCP calls await Context inside the parent request; serialize children in its slot.
      run: ((operation, signal, budget) => {
        nestedRun ??= createRequestLimiter({
          initialConcurrency: 1,
          maxConcurrency: 1,
          limits,
          allowNestedRequests: true,
        }).run;
        return nestedRun(operation, signal, budget);
      }) as typeof run,
    };
    try {
      signal?.throwIfAborted();
      const result = await execution.run(scope, operation);
      const actualInputTokens = budget.actualInputTokens?.(result);
      if (
        actualInputTokens !== undefined &&
        Number.isFinite(actualInputTokens) &&
        actualInputTokens >= 0
      )
        reservation.inputTokens = Math.ceil(actualInputTokens);
      if (
        (queue.length || [...demands].some((pending) => pending() > 0)) &&
        startedAt >= probeAfter &&
        ++successes >= concurrency * 2 &&
        concurrency < maxConcurrency
      ) {
        concurrency++;
        successes = 0;
        changed("healthy-probe", 0);
      }
      return result;
    } catch (error) {
      const backoff = getAiProviderBackoff(error);
      if (backoff) {
        pauseUntil = Math.max(pauseUntil, Date.now() + backoff.retryAfterMs);
        successes = 0;
        if (backoff.kind !== "unavailable") {
          concurrency = Math.max(1, Math.floor(concurrency / 2));
          probeAfter = pauseUntil + providerRecoveryProbeDelayMs;
        }
        changed(backoff.kind, backoff.retryAfterMs);
        if (backoff.kind === "concurrency" && !isRetryableAiError(error))
          throw new APICallError({
            message:
              "Provider concurrency limit reached. Retrying with fewer requests.",
            url: "provider://request-limit",
            requestBodyValues: undefined,
            statusCode: 429,
            responseHeaders: { "retry-after-ms": String(backoff.retryAfterMs) },
            isRetryable: true,
            data: {
              limitKind: "concurrency",
              transportStatus: getAiErrorStatus(error),
            },
          });
      }
      throw error;
    } finally {
      scope.active = false;
      release();
    }
  };
  const runStream = async <T extends { stream: ReadableStream<unknown> }>(
    operation: () => PromiseLike<T>,
    signal?: AbortSignal,
    budget: { inputTokens?: number } = {},
  ): Promise<T> => {
    let resolveStarted!: (result: T) => void;
    let rejectStarted!: (error: unknown) => void;
    const started = {
      promise: new Promise<T>((resolve, reject) => {
        resolveStarted = resolve;
        rejectStarted = reject;
      }),
      resolve: (result: T) => resolveStarted(result),
      reject: (error: unknown) => rejectStarted(error),
    };
    let resolveEnded!: () => void;
    let rejectEnded!: (error: unknown) => void;
    const ended = {
      promise: new Promise<void>((resolve, reject) => {
        resolveEnded = resolve;
        rejectEnded = reject;
      }),
      resolve: () => resolveEnded(),
      reject: (error: unknown) => rejectEnded(error),
    };
    void ended.promise.catch(() => {});
    void run(
      async () => {
        const result = await operation();
        const reader = result.stream.getReader();
        const abort = () => {
          void reader.cancel().catch(() => {});
          ended.reject(signal?.reason);
        };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        started.resolve({
          ...result,
          stream: new ReadableStream({
            async pull(controller) {
              try {
                const part = await reader.read();
                if (part.done) {
                  controller.close();
                  ended.resolve();
                } else controller.enqueue(part.value);
              } catch (error) {
                controller.error(error);
                ended.reject(error);
              }
            },
            async cancel(reason) {
              try {
                await reader.cancel(reason);
              } finally {
                ended.resolve();
              }
            },
          }),
        });
        try {
          await ended.promise;
          return result;
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      },
      signal,
      budget,
    ).catch(started.reject);
    return started.promise;
  };
  return {
    run,
    runStream,
    state,
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    registerDemand: (pending: () => number) => {
      demands.add(pending);
      return () => {
        demands.delete(pending);
      };
    },
  };
};

const limiters = new Map<string, ReturnType<typeof createRequestLimiter>>();

export const getRequestLimiter = (key: string, provider: string) => {
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = createRequestLimiter({
      ...(provider === "chatgpt-subscription" || provider === "claude-code"
        ? { initialConcurrency: 1, maxConcurrency: 2 }
        : {}),
      allowNestedRequests: provider === "claude-code",
      limits: provider === "google" ? googleRequestLimits : {},
      onChange: (state) =>
        console.info("[senslop:ai-capacity]", { provider, ...state }),
    });
    limiters.set(key, limiter);
  }
  return limiter;
};
