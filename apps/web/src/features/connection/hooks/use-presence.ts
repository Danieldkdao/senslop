"use client";

import type { ConnectionState } from "../types";
import { useEffect, useState, useEffectEvent } from "react";
import {
  presenceEventSchema,
  connectionTicketSchema,
  errorSchema,
  PROTOCOL_VERSION,
  previewEventSchema,
  type PreviewEventSchema,
} from "@senslop/contracts";

export const usePresence = (callbacks?: {
  onPreview(event: PreviewEventSchema): void;
  onDisconnect(): void;
}) => {
  const receivePreview = useEffectEvent((event: PreviewEventSchema) =>
    callbacks?.onPreview(event),
  );
  const disconnected = useEffectEvent(() => callbacks?.onDisconnect());
  const [state, setState] = useState<ConnectionState>({
    status: "connecting",
    devices: [],
  });

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const connect = async () => {
      try {
        const response = await fetch("/api/connection-ticket", {
          method: "POST",
        });
        if (!response.ok) {
          const error = errorSchema.safeParse(
            await response.json().catch(() => null),
          );
          retry(
            error.success
              ? error.data.message
              : "Connection ticket unavailable. Check your sign-in and website configuration.",
          );
          return;
        }
        const data = connectionTicketSchema.parse(await response.json());
        if (stopped) return;
        const url = new URL(data.connectionUrl);
        url.searchParams.set("protocolVersion", String(PROTOCOL_VERSION));
        url.searchParams.set("ticket", data.ticket);
        const currentSocket = new WebSocket(url);
        socket = currentSocket;
        currentSocket.onopen = () => {
          if (stopped || socket !== currentSocket) return;
          failures = 0;
          setState({ status: "live", devices: [] });
        };
        currentSocket.onmessage = (message) => {
          if (stopped || socket !== currentSocket) return;
          try {
            const data: unknown = JSON.parse(message.data);
            const preview = previewEventSchema.safeParse(data);
            if (preview.success) {
              receivePreview(preview.data);
              return;
            }
            const event = presenceEventSchema.safeParse(data);
            if (event.success && event.data.type === "presence.snapshot")
              setState({ status: "live", devices: event.data.devices });
          } catch {
            /* Unrecognized events never establish connection state. */
          }
        };
        currentSocket.onclose = () => {
          if (socket !== currentSocket) return;
          retry(
            "Browser connection closed. Check the connection service and sign in again if your session expired.",
          );
        };
        currentSocket.onerror = () => currentSocket.close();
      } catch {
        retry();
      }
    };
    const retry = (error = "Connection service unavailable.") => {
      if (stopped) return;
      disconnected();
      setState({ status: "retrying", devices: [], error });
      timer = setTimeout(connect, Math.min(1000 * 2 ** failures++, 30000));
    };
    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, []);
  return state;
};
