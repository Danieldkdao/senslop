"use client";

import type { ConnectionState } from "../types";
import { useEffect, useState } from "react";
import {
  presenceEventSchema,
  connectionTicketSchema,
  PROTOCOL_VERSION,
} from "@senslop/contracts";

export const usePresence = () => {
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
        if (!response.ok) throw new Error("Connection ticket unavailable");
        const data = connectionTicketSchema.parse(await response.json());
        if (stopped) return;
        const url = new URL(data.connectionUrl);
        url.searchParams.set("protocolVersion", String(PROTOCOL_VERSION));
        url.searchParams.set("ticket", data.ticket);
        socket = new WebSocket(url);
        socket.onopen = () => {
          failures = 0;
          setState({ status: "live", devices: [] });
        };
        socket.onmessage = (message) => {
          try {
            const event = presenceEventSchema.safeParse(
              JSON.parse(message.data),
            );
            if (event.success && event.data.type === "presence.snapshot")
              setState({ status: "live", devices: event.data.devices });
          } catch {
            /* Unrecognized events never establish connection state. */
          }
        };
        socket.onclose = () => retry();
        socket.onerror = () => socket?.close();
      } catch {
        retry();
      }
    };
    const retry = () => {
      if (stopped) return;
      setState({ status: "retrying", devices: [] });
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
