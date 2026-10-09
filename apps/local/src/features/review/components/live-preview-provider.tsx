"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { localPreviewSchema } from "@senslop/contracts";
import type { LivePreview } from "../types";
import { toast } from "@/components/ui/toast";

type PreviewContext = { preview: LivePreview | null; error: string | null };
const LivePreviewContext = createContext<PreviewContext | null>(null);

export const LivePreviewProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PreviewContext>({
    preview: null,
    error: null,
  });
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let currentId: string | undefined;
    let etag: string | null = null;
    let failed = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/preview", {
          cache: "no-store",
          signal: abort.signal,
          headers: etag ? { "If-None-Match": etag } : {},
        });
        if (abort.signal.aborted) return;
        if (response.status !== 304) {
          if (!response.ok) throw new Error("Snapshot unavailable.");
          const data: unknown = await response.json();
          if (abort.signal.aborted) return;
          if (data !== null) {
            const preview = localPreviewSchema.parse(data);
            if (preview.id !== currentId) {
              currentId = preview.id;
              setState({
                preview: {
                  ...preview,
                  expectedFiles: preview.files.length,
                  status: "ready",
                  error: null,
                },
                error: null,
              });
              toast.success("Your changes are ready to explore.");
            }
          }
          etag = response.headers?.get("etag") ?? null;
        }
        if (failed) setState((current) => ({ ...current, error: null }));
        failed = false;
      } catch {
        if (abort.signal.aborted) return;
        const error =
          "The local app is unavailable. Keep your CLI running or restart it.";
        setState((current) => ({ ...current, error }));
        if (!failed) toast.error(error);
        failed = true;
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, []);
  return <LivePreviewContext value={state}>{children}</LivePreviewContext>;
};

export const useLivePreview = () => {
  const context = useContext(LivePreviewContext);
  if (!context)
    throw new Error("useLivePreview must be used inside its provider.");
  return context;
};
