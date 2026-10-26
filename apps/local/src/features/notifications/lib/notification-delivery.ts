import type { NotificationKind } from "@senslop/contracts";

export const enableNotifications = async ({
  permission,
  request,
  save,
}: {
  permission: NotificationPermission;
  request: () => Promise<NotificationPermission>;
  save: (enabled: boolean) => Promise<unknown>;
}) => {
  const granted =
    permission === "granted"
      ? permission
      : permission === "denied"
        ? "denied"
        : await request();
  if (granted !== "granted")
    throw new Error(
      "Allow notifications in Chrome’s site settings to enable them.",
    );
  await save(true);
};

export const showDesktopNotification = async (
  title: string,
  options: NotificationOptions & { renotify?: boolean },
  shouldDeliver: () => boolean | Promise<boolean> = () => true,
) => {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    throw new Error(
      "Allow notifications in Chrome’s site settings, then retry.",
    );
  if (!navigator.serviceWorker)
    throw new Error("Desktop notifications are unavailable in this browser.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prepare = async () => {
    const registration = await navigator.serviceWorker.register(
      "/notification-worker.js",
    );
    return registration.active
      ? registration
      : await navigator.serviceWorker.ready;
  };
  const ready = await (async () => {
    try {
      return await Promise.race([
        prepare(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Chrome did not finish preparing notifications; reload this tab and retry.",
                ),
              ),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  })();
  if (!(await shouldDeliver())) return false;
  // Browser submission cannot be aborted, so only preparation has a timeout.
  await ready.showNotification(title, options);
  return true;
};

export const selectNotification = (
  kind: NotificationKind,
  status: string,
): NotificationKind | null => {
  if (["failed", "blocked", "timed-out", "interrupted"].includes(status))
    return "attention";
  return ["completed", "passed", "returned", "complete"].includes(status)
    ? kind
    : null;
};
