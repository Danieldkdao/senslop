"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { notificationEventSchema } from "@senslop/contracts";
import { useNotificationPreferences } from "../hooks/use-notification-preferences";
import { formatNotificationKind } from "../lib/formatters";
import { showDesktopNotification } from "../lib/notification-delivery";

const cursorKey = "senslop:notification-cursor";
const feedSchema = z.object({
  events: z.array(notificationEventSchema),
  latest: z.number(),
});

export const NotificationListener = () => {
  const { preferences, permitted } = useNotificationPreferences();
  const enabled = preferences.enabled && permitted;
  const feed = useQuery({
    queryKey: ["notification-events", enabled],
    enabled,
    queryFn: async ({ signal }) => {
      const cursor = localStorage.getItem(cursorKey);
      const response = await fetch(`/api/notifications?after=${cursor ?? 0}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Notification activity unavailable.");
      const data = feedSchema.parse(await response.json());
      if (cursor === null) {
        localStorage.setItem(cursorKey, String(data.latest));
        return { ...data, events: [] };
      }
      return data;
    },
    retry: false,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    networkMode: "always",
  });
  useEffect(() => {
    if (!enabled || !feed.data) return;
    let stopped = false;
    const deliver = async () => {
      if (stopped) return;
      for (const event of feed.data!.events) {
        if (stopped) return;
        if (event.sequence <= Number(localStorage.getItem(cursorKey) ?? 0))
          continue;
        const viewing =
          document.visibilityState === "visible" &&
          document.hasFocus() &&
          new URLSearchParams(location.search).get("review") === event.reviewId;
        if (
          preferences.categories[event.kind] &&
          (preferences.foreground || !viewing)
        ) {
          const display = formatNotificationKind(event.kind);
          const owner = crypto.randomUUID();
          let claimed = false;
          let claimedElsewhere = false;
          let delivered = false;
          const claim = async (action: "claim" | "release") => {
            const response = await fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, id: event.id, owner }),
            });
            if (!response.ok)
              throw new Error("Notification delivery unavailable.");
            return response.json() as Promise<{ claimed?: boolean }>;
          };
          try {
            delivered = await showDesktopNotification(
              "Senslop",
              {
                body: preferences.showNames
                  ? `${display.label} — ${event.title}`
                  : display.label,
                tag: event.id,
                data: { destination: event.destination },
              },
              async () => {
                if (stopped) return false;
                claimed = (await claim("claim")).claimed === true;
                claimedElsewhere = !claimed;
                return claimed && !stopped;
              },
            );
          } catch {
            return;
          } finally {
            if (claimed && !delivered) await claim("release").catch(() => {});
          }
          if (!delivered && !claimedElsewhere) return;
        }
        localStorage.setItem(cursorKey, String(event.sequence));
      }
    };
    if (navigator.locks)
      void navigator.locks
        .request("senslop-notifications", deliver)
        .catch(() => {});
    else void deliver().catch(() => {});
    return () => {
      stopped = true;
    };
  }, [enabled, feed.data, preferences]);
  return null;
};
