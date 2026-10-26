// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notificationKinds } from "@senslop/contracts";
import { NotificationListener } from "../components/notification-listener";
const browser = vi.hoisted(() => ({
  show: vi.fn(
    async (
      _title: unknown,
      _options: unknown,
      shouldDeliver: () => boolean | Promise<boolean>,
    ) => await shouldDeliver(),
  ),
}));
vi.mock("../lib/notification-delivery", () => ({
  showDesktopNotification: browser.show,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("listeners without Web Locks atomically claim one completion across simultaneous clients", async () => {
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  localStorage.setItem("senslop:notification-cursor", "0");
  localStorage.setItem(
    "senslop:notifications",
    JSON.stringify({
      enabled: true,
      foreground: true,
      showNames: false,
      categories: Object.fromEntries(
        notificationKinds.map((kind) => [kind, true]),
      ),
    }),
  );
  const event = {
    sequence: 1,
    id: "review:fixture:completed",
    kind: "review",
    reviewId: null,
    title: "Finished",
    destination: "/",
    createdAt: new Date().toISOString(),
  };
  let owner: string | null = null;
  let accepted = 0;
  browser.show.mockImplementation(async (_title, _options, shouldDeliver) => {
    const allow = await shouldDeliver();
    if (allow) accepted++;
    return allow;
  });
  const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
    if (options?.method === "POST") {
      const action = JSON.parse(String(options.body));
      if (action.action === "claim") {
        const claimed = owner === null;
        if (claimed) owner = action.owner;
        return Response.json({ claimed });
      }
      return Response.json({ saved: true, completed: true });
    }
    return Response.json({ events: [event], latest: 1 });
  });
  vi.stubGlobal("fetch", request);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationListener />
      <NotificationListener />
    </QueryClientProvider>,
  );
  try {
    await waitFor(() => expect(accepted).toBe(1));
    expect(localStorage.getItem("senslop:notification-cursor")).toBe("1");
    expect(
      request.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(true);
  } finally {
    view.unmount();
    client.clear();
  }
});

test("a failed delivery retries even when polling returns the identical event feed", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  localStorage.setItem("senslop:notification-cursor", "0");
  localStorage.setItem(
    "senslop:notifications",
    JSON.stringify({
      enabled: true,
      foreground: true,
      showNames: false,
      categories: Object.fromEntries(
        notificationKinds.map((kind) => [kind, true]),
      ),
    }),
  );
  const event = {
    sequence: 1,
    id: "retry",
    kind: "review",
    reviewId: null,
    title: "Finished",
    destination: "/",
    createdAt: new Date().toISOString(),
  };
  browser.show
    .mockImplementationOnce(async (_title, _options, shouldDeliver) => {
      await shouldDeliver();
      throw new Error("Temporary browser failure");
    })
    .mockImplementation(
      async (_title, _options, shouldDeliver) => await shouldDeliver(),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, options?: RequestInit) =>
      options?.method === "POST"
        ? Response.json({ claimed: true, completed: true })
        : Response.json({ events: [event], latest: 1 }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationListener />
    </QueryClientProvider>,
  );
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(browser.show).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(browser.show).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("senslop:notification-cursor")).toBe("1");
  } finally {
    view.unmount();
    client.clear();
    vi.useRealTimers();
  }
});

test("a pending claim in another tab does not advance the cursor before completion", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  localStorage.setItem("senslop:notification-cursor", "0");
  localStorage.setItem(
    "senslop:notifications",
    JSON.stringify({
      enabled: true,
      foreground: true,
      showNames: false,
      categories: Object.fromEntries(
        notificationKinds.map((kind) => [kind, true]),
      ),
    }),
  );
  const event = {
    sequence: 1,
    id: "other-tab",
    kind: "review",
    reviewId: null,
    title: "Finished",
    destination: "/",
    createdAt: new Date().toISOString(),
  };
  let completed = false;
  browser.show.mockImplementation(
    async (_title, _options, shouldDeliver) => await shouldDeliver(),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, options?: RequestInit) =>
      options?.method === "POST"
        ? Response.json({ claimed: false, completed })
        : Response.json({ events: [event], latest: 1 }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationListener />
    </QueryClientProvider>,
  );
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(localStorage.getItem("senslop:notification-cursor")).toBe("0");
    completed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(localStorage.getItem("senslop:notification-cursor")).toBe("1");
  } finally {
    view.unmount();
    client.clear();
    vi.useRealTimers();
  }
});
