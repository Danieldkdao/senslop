import { APICallError } from "ai";
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
  limits = {},
  onChange,
}: {
  initialConcurrency?: number;
  maxConcurrency?: number;
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
    try {
      signal?.throwIfAborted();
      const result = await operation();
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
      release();
    }
  };
  return {
    run,
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
      limits: provider === "google" ? googleRequestLimits : {},
      onChange: (state) =>
        console.info("[senslop:ai-capacity]", { provider, ...state }),
    });
    limiters.set(key, limiter);
  }
  return limiter;
};
