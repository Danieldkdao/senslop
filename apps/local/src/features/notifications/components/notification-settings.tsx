"use client";

import { useState } from "react";
import { Bell, Send } from "lucide-react";
import { notificationKinds } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { toast } from "@/components/ui/toast";
import { useNotificationPreferences } from "../hooks/use-notification-preferences";
import {
  enableNotifications,
  showDesktopNotification,
} from "../lib/notification-delivery";
import { formatNotificationKind } from "../lib/formatters";

export const NotificationSettings = () => {
  const { preferences, save, supported, permitted } =
    useNotificationPreferences();
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const enabled = preferences.enabled && permitted;
  const update = (operation: Promise<unknown>) => {
    void operation.catch((error: Error) => toast.error(error.message));
  };
  return (
    <div className="flex flex-col gap-4 text-base">
      <div className="flex items-center gap-3">
        <Bell className="size-5" />
        <div className="flex-1">
          <p>Desktop notifications</p>
          <p className="text-muted-foreground">
            Choose which background activity can notify you.
          </p>
        </div>
        <LoadingSwap
          isLoading={pending}
          className="flex items-center justify-center gap-2"
        >
          <Switch
            aria-label="Desktop notifications"
            checked={enabled}
            disabled={!supported || pending}
            onCheckedChange={async (checked) => {
              setPending(true);
              try {
                if (!checked) await save({ enabled: false });
                else
                  await enableNotifications({
                    permission: Notification.permission,
                    request: () => Notification.requestPermission(),
                    save: (enabled) => save({ enabled }),
                  });
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setPending(false);
              }
            }}
          />
        </LoadingSwap>
      </div>
      {!supported && (
        <p className="text-muted-foreground">
          Desktop notifications are unavailable in this browser.
        </p>
      )}
      {supported && !permitted && preferences.enabled && (
        <p role="status">Allow notifications in this site’s Chrome settings.</p>
      )}
      {enabled && (
        <>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-medium">Notify me about</span>
            <TooltipWrapper content="Send test notification">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Send test notification"
                disabled={testing}
                aria-busy={testing}
                onClick={async () => {
                  setTesting(true);
                  try {
                    await showDesktopNotification("Senslop", {
                      body: "This is a test notification from Senslop.",
                      tag: "senslop-test",
                      renotify: true,
                      data: {
                        destination: location.pathname + location.search,
                      },
                    });
                    const message =
                      "Chrome accepted the test; look for “Senslop” in your system notifications.";
                    toast.success(message);
                  } catch (error) {
                    const message = (error as Error).message;
                    toast.error(message);
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <LoadingSwap
                  isLoading={testing}
                  className="flex items-center justify-center gap-2"
                >
                  <Send aria-hidden="true" className="size-5" />
                </LoadingSwap>
              </Button>
            </TooltipWrapper>
          </div>
          <div className="flex flex-col">
            {notificationKinds.map((kind) => {
              const display = formatNotificationKind(kind);
              return (
                <div
                  key={kind}
                  className="flex items-center gap-3 border-b py-3"
                >
                  <display.Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="flex flex-1 flex-col gap-1">
                    <span>{display.label}</span>
                    <span className="text-muted-foreground">
                      {display.description}
                    </span>
                  </span>
                  <Switch
                    aria-label={display.label}
                    checked={preferences.categories[kind]}
                    onCheckedChange={(checked) =>
                      update(
                        save({
                          categories: {
                            ...preferences.categories,
                            [kind]: checked,
                          },
                        }),
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
          <label className="flex items-center gap-3">
            <span className="flex-1">Notify while viewing the activity</span>
            <Switch
              checked={preferences.foreground}
              onCheckedChange={(foreground) => update(save({ foreground }))}
            />
          </label>
          <label className="flex items-center gap-3">
            <span className="flex-1">Show project and review names</span>
            <Switch
              checked={preferences.showNames}
              onCheckedChange={(showNames) => update(save({ showNames }))}
            />
          </label>
          <p className="text-muted-foreground">
            Keep the app and a workspace tab open; selected categories notify
            you when their activity finishes in the background.
          </p>
        </>
      )}
    </div>
  );
};
