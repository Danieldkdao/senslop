"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  notificationKinds,
  notificationPreferencesSchema,
  type NotificationPreferencesSchema,
} from "@senslop/contracts";
import { trackSettingsSave } from "../../settings/lib/settings-save-store";

const key = "senslop:notifications";
const defaultPreferences: NotificationPreferencesSchema = {
  enabled: false,
  foreground: false,
  showNames: false,
  categories: Object.fromEntries(
    notificationKinds.map((kind) => [kind, false]),
  ) as NotificationPreferencesSchema["categories"],
};
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener("senslop-notifications", listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("senslop-notifications", listener);
    window.removeEventListener("focus", listener);
  };
};
const snapshot = () =>
  `${typeof Notification === "undefined" ? "unsupported" : Notification.permission}|${localStorage.getItem(key) ?? ""}`;

export const useNotificationPreferences = () => {
  const value = useSyncExternalStore(subscribe, snapshot, () => "unsupported|");
  const preferences = useMemo(() => {
    try {
      return notificationPreferencesSchema.parse(
        JSON.parse(value.slice(value.indexOf("|") + 1)),
      );
    } catch {
      return defaultPreferences;
    }
  }, [value]);
  const save = (patch: Partial<NotificationPreferencesSchema>) =>
    trackSettingsSave("notifications", async () => {
      const current = (() => {
        try {
          return notificationPreferencesSchema.parse(
            JSON.parse(localStorage.getItem(key) ?? "null"),
          );
        } catch {
          return defaultPreferences;
        }
      })();
      if (patch.enabled !== undefined && patch.enabled !== current.enabled)
        localStorage.removeItem("senslop:notification-cursor");
      localStorage.setItem(
        key,
        JSON.stringify(
          notificationPreferencesSchema.parse({ ...current, ...patch }),
        ),
      );
      window.dispatchEvent(new Event("senslop-notifications"));
    });
  return {
    preferences,
    save,
    supported: value.split("|")[0] !== "unsupported",
    permitted: value.startsWith("granted|"),
  };
};
