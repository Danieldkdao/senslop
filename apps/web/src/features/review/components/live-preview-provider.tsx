"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePresence } from "@/features/connection/hooks/use-presence";
import type { ConnectionState } from "@/features/connection/types";
import type { LivePreview } from "../types";
import { reducePreview } from "../lib/preview-state";
import { toast } from "@/components/ui/toast";

const LivePreviewContext = createContext<{
  connection: ConnectionState;
  preview: LivePreview | null;
}>({ connection: { status: "connecting", devices: [] }, preview: null });

export const LivePreviewProvider = ({ children }: { children: ReactNode }) => {
  const [preview, setPreview] = useState<LivePreview | null>(null);
  const notified = useRef<string | null>(null);
  const connection = usePresence({
    onPreview: (event) => {
      setPreview((current) => reducePreview(current, event));
    },
    onDisconnect: () =>
      setPreview((current) =>
        current?.status === "receiving"
          ? {
              ...current,
              status: "failed",
              error:
                "Connection interrupted. Reconnect and send the preview again.",
            }
          : current,
      ),
  });
  useEffect(() => {
    if (!preview || preview.status === "receiving") return;
    const key = `${preview.id}:${preview.status}`;
    if (notified.current === key) return;
    notified.current = key;
    if (preview.status === "ready")
      toast.success("Your changes are ready to explore.");
    else
      toast.error(
        preview.error ?? "Preview failed. Send it again from the CLI.",
      );
  }, [preview]);
  return (
    <LivePreviewContext value={{ connection, preview }}>
      {children}
    </LivePreviewContext>
  );
};

export const useLivePreview = () => {
  const context = useContext(LivePreviewContext);
  if (!context)
    throw new Error(
      "useLivePreview must be used inside of the LivePreview context provider.",
    );

  return context;
};
