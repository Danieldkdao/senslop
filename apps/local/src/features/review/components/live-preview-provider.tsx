"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  localPreviewSchema,
  savedReviewSchema,
  type ReviewChangeSchema,
} from "@senslop/contracts";
import type { LivePreview } from "../types";
import { toast } from "@/components/ui/toast";

class LocalPreviewRequestError extends Error {}

type PreviewContext = {
  preview: LivePreview | null;
  error: string | null;
  refresh: () => Promise<void>;
  changeReview: (change: ReviewChangeSchema) => Promise<void>;
};
const LivePreviewContext = createContext<PreviewContext | null>(null);

export const LivePreviewProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<{
    preview: LivePreview | null;
    error: string | null;
  }>({ preview: null, error: null });
  const etag = useRef<string | null>(null);
  const epoch = useRef(0);
  const stateRef = useRef(state);
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
      const response = await fetch("/api/preview", {
        cache: "no-store",
        signal,
        headers:
          !force && etag.current ? { "If-None-Match": etag.current } : {},
      });
      if (!response.ok && response.status !== 304) {
        const failure = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new LocalPreviewRequestError(
          failure?.message ??
            "The local app is unavailable. Keep your CLI running or restart it. Check application-data permissions and retry.",
        );
      }
      if (signal?.aborted || started !== epoch.current) return;
      if (response.status !== 304) {
        const data: unknown = await response.json();
        if (signal?.aborted || started !== epoch.current) return;
        const newId =
          data && typeof data === "object" && "id" in data ? data.id : null;
        apply(data);
        if (newId && newId !== stateRef.current.preview?.id)
          toast.success("Your changes are ready to explore.");
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
  const changeReview = useCallback(
    async (change: ReviewChangeSchema) => {
      const id = stateRef.current.preview?.id;
      if (!id) throw new Error("Select a saved review first.");
      epoch.current++;
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "change", id, change }),
        });
        const data: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            (data as { message?: string }).message ??
              "Local save failed. Retry.",
          );
        const saved = savedReviewSchema.parse(data);
        if (stateRef.current.preview?.id === id) apply(saved);
        etag.current = null;
      } catch (error) {
        toast.error((error as Error).message);
        throw error;
      }
    },
    [apply],
  );
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
    <LivePreviewContext value={{ ...state, refresh, changeReview }}>
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
