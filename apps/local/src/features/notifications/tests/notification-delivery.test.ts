import { expect, test, vi } from "vitest";
import {
  enableNotifications,
  selectNotification,
  showDesktopNotification,
} from "../lib/notification-delivery";

test("permission denial and dismissal never enable notifications", async () => {
  const save = vi.fn();
  await expect(
    enableNotifications({
      permission: "default",
      request: async () => "denied",
      save,
    }),
  ).rejects.toThrow(/allow/i);
  await expect(
    enableNotifications({
      permission: "default",
      request: async () => "default",
      save,
    }),
  ).rejects.toThrow(/allow/i);
  expect(save).not.toHaveBeenCalled();
  await enableNotifications({ permission: "granted", request: vi.fn(), save });
  expect(save).toHaveBeenCalledExactlyOnceWith(true);
});

test("success and attention are independent and canceled work is silent", () => {
  expect(selectNotification("grouping", "completed")).toBe("grouping");
  expect(selectNotification("review", "failed")).toBe("attention");
  expect(selectNotification("checks", "passed")).toBe("checks");
  expect(selectNotification("checks", "failed")).toBe("attention");
  expect(selectNotification("review", "canceled")).toBe(null);
});

test("notification preparation times out instead of silently waiting forever", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "granted" });
  const showNotification = vi.fn();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => ({ active: null, showNotification })),
      ready: new Promise(() => {}),
    },
  });
  try {
    const request = showDesktopNotification("Senslop", { body: "Test" });
    const rejected = expect(request).rejects.toThrow(/reload.*retry/i);
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(showNotification).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test("an active notification worker does not wait for another registration", async () => {
  vi.stubGlobal("Notification", { permission: "granted" });
  const showNotification = vi.fn(async () => {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => ({ active: {}, showNotification })),
      ready: new Promise(() => {}),
    },
  });
  try {
    await showDesktopNotification("Senslop", { body: "Test" });
    expect(showNotification).toHaveBeenCalledWith("Senslop", { body: "Test" });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a submitted notification is not reported failed while the browser is still accepting it", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "granted" });
  let accepted!: () => void;
  const showNotification = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        accepted = resolve;
      }),
  );
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => ({ active: {}, showNotification })),
    },
  });
  try {
    const settled = vi.fn();
    const request = showDesktopNotification("Senslop", { body: "Test" }).then(
      (value) => {
        settled(value);
      },
      (error) => {
        settled(error);
      },
    );
    await vi.advanceTimersByTimeAsync(10001);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    accepted();
    await request;
    expect(settled).toHaveBeenCalledExactlyOnceWith(true);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

test("expired preparation cannot submit a notification after the worker finally becomes ready", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "granted" });
  let ready!: (value: unknown) => void;
  const showNotification = vi.fn();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => ({ active: null })),
      ready: new Promise((resolve) => {
        ready = resolve;
      }),
    },
  });
  try {
    const request = showDesktopNotification("Senslop", { body: "Test" });
    const rejected = expect(request).rejects.toThrow(/reload.*retry/i);
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    ready({ showNotification });
    await vi.advanceTimersByTimeAsync(1);
    expect(showNotification).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
