// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notificationKinds } from "@senslop/contracts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationSettings } from "../components/notification-settings";

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("grant reveals independent opt-ins; denial and revocation leave desktop delivery off", async () => {
  const browser = {
    permission: "default",
    requestPermission: vi.fn(async () => "denied"),
  };
  vi.stubGlobal("Notification", browser);
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <NotificationSettings />
    </TooltipProvider>,
  );
  await user.click(
    screen.getByRole("switch", { name: "Desktop notifications" }),
  );
  await waitFor(() => expect(feedback.error).toHaveBeenCalled());
  expect(
    screen
      .getByRole("switch", { name: "Desktop notifications" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.queryByRole("switch", { name: "Grouping completed" })).toBe(
    null,
  );
  browser.requestPermission.mockImplementation(async () => {
    browser.permission = "granted";
    return "granted";
  });
  await user.click(
    screen.getByRole("switch", { name: "Desktop notifications" }),
  );
  await waitFor(() => expect(screen.getByText("Notify me about")).toBeTruthy());
  await user.click(
    await screen.findByRole("switch", { name: "Grouping completed" }),
  );
  expect(
    screen
      .getByRole("switch", { name: "Grouping completed" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("switch", { name: "Chat response completed" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.queryByText("Reading completed")).toBe(null);
  browser.permission = "denied";
  window.dispatchEvent(new Event("focus"));
  await waitFor(() =>
    expect(
      screen
        .getByRole("switch", { name: "Desktop notifications" })
        .getAttribute("aria-checked"),
    ).toBe("false"),
  );
});

const setupTestNotification = () => {
  vi.stubGlobal("Notification", { permission: "granted" });
  localStorage.setItem(
    "senslop:notifications",
    JSON.stringify({
      enabled: true,
      foreground: false,
      showNames: false,
      categories: Object.fromEntries(
        notificationKinds.map((kind) => [kind, false]),
      ),
    }),
  );
  const registration = {
    active: {},
    update: vi.fn(async () => {}),
    showNotification: vi.fn(async () => {}),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  render(
    <TooltipProvider>
      <NotificationSettings />
    </TooltipProvider>,
  );
  return registration;
};

test("test notification reports browser acceptance through toast feedback", async () => {
  const registration = setupTestNotification();
  fireEvent.click(
    screen.getByRole("button", { name: "Send test notification" }),
  );
  await waitFor(() => expect(registration.showNotification).toHaveBeenCalled());
  expect(registration.showNotification).toHaveBeenCalledWith(
    "Senslop",
    expect.objectContaining({
      renotify: true,
      body: "This is a test notification from Senslop.",
    }),
  );
  await waitFor(() => expect(feedback.success).toHaveBeenCalled());
  expect(feedback.success).toHaveBeenCalledWith(
    expect.stringMatching(/Chrome accepted/),
  );
  expect(screen.queryByText(/Expect a Chrome desktop notification/)).toBeNull();
  expect(screen.queryByText(/Chrome accepted the test/)).toBeNull();
  expect(screen.queryByText(/If no banner appears/)).toBeNull();
});

test("test notification shows pending feedback and prevents duplicate sends", async () => {
  const registration = setupTestNotification();
  let finish!: () => void;
  registration.showNotification.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const button = screen.getByRole("button", { name: "Send test notification" });
  fireEvent.click(button);
  await waitFor(() => expect(registration.showNotification).toHaveBeenCalled());
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect((button as HTMLButtonElement).disabled).toBe(true);
  finish();
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
});
