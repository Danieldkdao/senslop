"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  localPreviewSchema,
  savedReviewSchema,
  reviewStateSchema,
  type ReviewChangeSchema,
  type SavedReviewSchema,
} from "@senslop/contracts";
import type { LivePreview, ReviewOperation } from "../types";
import { toast } from "@/components/ui/toast";
import { createReviewChangeQueue } from "../lib/review-change-queue";

class LocalPreviewRequestError extends Error {}

const localRequestTimeoutMs = 15000;

type PreviewContext = {
  preview: LivePreview | null;
  reviewOperation: ReviewOperation | null;
  trackReviewOperation: (operation: ReviewOperation | null) => void;
  error: string | null;
  refresh: () => Promise<void>;
  openReview: (review: SavedReviewSchema) => void;
  discardReview: () => Promise<void>;
  changeReview: (change: ReviewChangeSchema) => Promise<void>;
};
const LivePreviewContext = createContext<PreviewContext | null>(null);

export const LivePreviewProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<{
    preview: LivePreview | null;
    error: string | null;
  }>({ preview: null, error: null });
  const [reviewOperation, trackReviewOperation] =
    useState<ReviewOperation | null>(null);
  const etag = useRef<string | null>(null);
  const epoch = useRef(0);
  const stateRef = useRef(state);
  const selectedReview = useRef<string | null>(null);
  const initialized = useRef(false);
  const selectedPaths = useRef(new Map<string, string>());
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const apply = useCallback((data: unknown) => {
    if (data === null) {
      setState({ preview: null, error: null });
      return;
    }
    const durable = savedReviewSchema.safeParse(data);
    const preview = durable.success
      ? durable.data
      : localPreviewSchema.parse(data);
    selectedReview.current = preview.id;
    const url = new URL(window.location.href);
    url.searchParams.set("review", preview.id);
    const storedPath = [
      selectedPaths.current.get(preview.id),
      url.searchParams.get("file"),
      sessionStorage.getItem(`senslop:selected:${preview.id}`),
      durable.success ? durable.data.selectedPath : null,
    ].find((path) => path && preview.files.some((file) => file.path === path));
    if (
      durable.success &&
      storedPath &&
      preview.files.some((file) => file.path === storedPath)
    ) {
      durable.data.selectedPath = storedPath;
      selectedPaths.current.set(preview.id, storedPath);
      sessionStorage.setItem(`senslop:selected:${preview.id}`, storedPath);
    }
    url.searchParams.delete("file");
    window.history.replaceState(null, "", url);
    setState((current) => {
      if (
        current.preview?.id === preview.id &&
        (current.preview.revision ?? 0) >
          (durable.success ? durable.data.revision : 0)
      )
        return current;
      return {
        preview: {
          ...preview,
          ...(durable.success &&
          current.preview?.id === preview.id &&
          current.preview.hash === durable.data.hash
            ? { files: current.preview.files }
            : {}),
          expectedFiles: preview.files.length,
          status: "ready",
          error: null,
        },
        error: null,
      };
    });
  }, []);
  const poll = useCallback(
    async (signal?: AbortSignal, force = false) => {
      const started = epoch.current;
      if (!initialized.current) {
        selectedReview.current = new URL(window.location.href).searchParams.get(
          "review",
        );
        initialized.current = true;
      }
      const response = await fetch(
        selectedReview.current
          ? `/api/preview?id=${encodeURIComponent(selectedReview.current)}`
          : "/api/preview",
        {
          cache: "no-store",
          signal: AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(localRequestTimeoutMs),
          ]),
          headers:
            !force && etag.current ? { "If-None-Match": etag.current } : {},
        },
      );
      if (signal?.aborted || started !== epoch.current) {
        await response.body?.cancel().catch(() => {});
        return;
      }
      if (!response.ok && response.status !== 304) {
        const failure = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new LocalPreviewRequestError(
          failure?.message ??
            "The local app is unavailable. Keep your CLI running or restart it. Check application-data permissions and retry.",
        );
      }

      if (response.status !== 304) {
        const data: unknown = await response.json();
        if (signal?.aborted || started !== epoch.current) return;
        apply(data);
        etag.current = response.headers?.get("etag") ?? null;
      }
      setState((current) =>
        current.error ? { ...current, error: null } : current,
      );
    },
    [apply],
  );
  const refresh = useCallback(async () => {
    epoch.current++;
    etag.current = null;
    await poll(undefined, true);
  }, [poll]);
  const openReview = useCallback(
    (review: SavedReviewSchema) => {
      epoch.current++;
      etag.current = null;
      const url = new URL(window.location.href);
      url.searchParams.delete("file");
      window.history.replaceState(null, "", url);
      apply(review);
    },
    [apply],
  );
  useEffect(() => {
    const navigate = () => {
      selectedReview.current = new URL(window.location.href).searchParams.get(
        "review",
      );
      void refresh().catch(() => {});
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, [refresh]);
  const requestReview = useCallback(
    async (body: object, signal?: AbortSignal) => {
      epoch.current++;
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(localRequestTimeoutMs),
          ]),
        });
        const data: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            (data as { message?: string })?.message ??
              "Local save failed. Retry.",
          );
        etag.current = response.headers?.get("etag") ?? null;
        return data;
      } catch (error) {
        if ((error as Error).name !== "AbortError")
          toast.error(
            (error as Error).name === "TimeoutError"
              ? "Local save timed out. Retry when ready."
              : (error as Error).message,
          );
        throw error;
      }
    },
    [],
  );
  const changes = useMemo(() => createReviewChangeQueue(), []);
  const saveChange = useCallback(
    async (
      id: string,
      change: ReviewChangeSchema,
      signal: AbortSignal,
      expected: { hash?: string; round?: number },
    ) => {
      if (
        stateRef.current.preview?.id !== id ||
        stateRef.current.preview.hash !== expected.hash ||
        stateRef.current.preview.round !== expected.round
      )
        throw new DOMException("Review changed.", "AbortError");
      const data = await requestReview(
        {
          action: "change",
          id,
          change,
          expectedHash: expected.hash,
          expectedRound: expected.round,
          response: "state",
        },
        signal,
      );
      if (signal.aborted)
        throw new DOMException("Review closed.", "AbortError");
      const metadata = reviewStateSchema.safeParse(data);
      if (metadata.success) {
        setState((current) => {
          if (
            current.preview?.id !== id ||
            current.preview.hash !== metadata.data.hash ||
            current.preview.round !== metadata.data.round ||
            (current.preview.revision ?? 0) > metadata.data.revision
          )
            return current;
          return {
            ...current,
            preview: {
              ...current.preview,
              ...metadata.data,
              selectedPath:
                selectedPaths.current.get(id) ?? current.preview.selectedPath,
            },
          };
        });
        return;
      }
      const saved = savedReviewSchema.safeParse(data);
      if (!saved.success) {
        toast.error("The saved review response could not be read. Retry.");
        throw saved.error;
      }
      if (stateRef.current.preview?.id === id) apply(saved.data);
    },
    [apply, requestReview],
  );
  useEffect(
    () => () => changes.cancel(),
    [changes, state.preview?.id, state.preview?.hash, state.preview?.round],
  );
  const changeReview = useCallback(
    (change: ReviewChangeSchema) => {
      const preview = stateRef.current.preview;
      if (!preview)
        return Promise.reject(new Error("Select a saved review first."));
      const expected = { hash: preview.hash, round: preview.round };
      if (change.action === "select") {
        selectedPaths.current.set(preview.id, change.path);
        sessionStorage.setItem(`senslop:selected:${preview.id}`, change.path);
        setState((current) =>
          current.preview?.id === preview.id
            ? {
                ...current,
                preview: { ...current.preview, selectedPath: change.path },
              }
            : current,
        );
      }
      return changes.enqueue(preview.id, change, (id, queuedChange, signal) =>
        saveChange(id, queuedChange, signal, expected),
      );
    },
    [changes, saveChange],
  );
  const discardReview = useCallback(async () => {
    const id = stateRef.current.preview?.id;
    if (!id) return;
    await requestReview({
      action: "delete",
      id,
      expectedHash: stateRef.current.preview?.hash,
      expectedRound: stateRef.current.preview?.round,
    });
    if (stateRef.current.preview?.id === id) {
      trackReviewOperation(null);
      selectedReview.current = null;
      const url = new URL(window.location.href);
      url.searchParams.delete("review");
      window.history.replaceState(null, "", url);
      apply(null);
    }
    await refresh();
  }, [apply, requestReview, refresh]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failed = false;
    const tick = async () => {
      try {
        await poll(abort.signal);
        failed = false;
      } catch (failure) {
        if (abort.signal.aborted) return;
        const error =
          failure instanceof LocalPreviewRequestError
            ? failure.message
            : "The local app is unavailable. Keep your CLI running or restart it. Check application-data permissions and retry.";
        setState((current) => ({ ...current, error }));
        if (!failed) toast.error(error);
        failed = true;
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(tick, 1000);
      }
    };
    void tick();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [poll]);
  return (
    <LivePreviewContext
      value={{
        ...state,
        reviewOperation,
        trackReviewOperation,
        refresh,
        openReview,
        changeReview,
        discardReview,
      }}
    >
      {children}
    </LivePreviewContext>
  );
};

export const useLivePreview = () => {
  const context = useContext(LivePreviewContext);
  if (!context)
    throw new Error("useLivePreview must be used inside its provider.");
  return context;
};
