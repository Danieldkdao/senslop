// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicConnectionSchema } from "@senslop/contracts";
import { SubscriptionProvider } from "../components/subscription-provider";
import { toast } from "@/components/ui/toast";

vi.mock("@/components/ui/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const connection: PublicConnectionSchema = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "chatgpt-subscription",
  name: "ChatGPT Subscription",
  baseURL: "https://api.openai.com/v1",
  contextWindow: null,
  model: "",
  configured: true,
  credentialError: null,
  account: { email: "reviewer@example.com", subject: "user", plan: "free" },
};

test("sign-in opens provider authorization, refreshes the account row, and sign-out updates immediately", async () => {
  let signedIn = false;
  const popup = { location: { href: "about:blank" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      if (init?.method === "POST") {
        const input = JSON.parse(init.body);
        if (input.action === "sign-out") {
          signedIn = false;
          return Response.json({ warning: null });
        }
        return Response.json({
          id: connection.id,
          provider: "chatgpt-subscription",
          status: "pending",
          url: "https://auth.openai.com/api/accounts/authorize",
          error: null,
        });
      }
      signedIn = true;
      return Response.json({
        id: connection.id,
        provider: "chatgpt-subscription",
        status: "complete",
        url: null,
        error: null,
      });
    }),
  );
  const Harness = () => {
    const [account, setAccount] = useState<PublicConnectionSchema>();
    return (
      <SubscriptionProvider
        provider="chatgpt-subscription"
        connection={account}
        onSaved={async () => {
          setAccount(signedIn ? connection : undefined);
        }}
      />
    );
  };
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Sign In ChatGPT Subscription" }),
  );
  expect(await screen.findByText("reviewer@example.com")).toBeTruthy();
  expect(popup.location.href).toContain("auth.openai.com");
  await user.click(
    screen.getByRole("button", { name: "Sign Out ChatGPT Subscription" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("reviewer@example.com")).toBeNull(),
  );
  expect(
    screen.getByRole("button", { name: "Sign In ChatGPT Subscription" }),
  ).toBeTruthy();
});

test("authentication failures update the header status and toast without an inline error block", async () => {
  const status = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: "Sign-in could not start." }, { status: 503 }),
    ),
  );
  render(
    <SubscriptionProvider
      provider="claude-code"
      onSaved={async () => {}}
      onStatusChange={status}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign In Claude Code" }));
  await waitFor(() =>
    expect(status).toHaveBeenLastCalledWith({
      busy: false,
      error: "Sign-in could not start.",
    }),
  );
  expect(toast.error).toHaveBeenCalledWith("Sign-in could not start.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Sign In Claude Code",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
