// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyAccount } from "@/components/auth/verify-account";

const state = vi.hoisted(() => ({
  verify: vi.fn(),
  resend: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  setEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    emailOtp: { verifyEmail: state.verify, sendVerificationOtp: state.resend },
  },
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: state.success, error: state.error },
}));

beforeEach(() => {
  vi.resetAllMocks();
  // JSDOM has no layout hit-testing; input-otp also works when no element is hit.
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => null),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.verify.mockResolvedValue({ error: null });
  state.resend.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const showVerification = (redirectTo = "/device?user_code=ABCD-EFGH") =>
  render(
    <VerifyAccount
      email="developer@example.com"
      setEmail={state.setEmail}
      redirectTo={redirectTo}
    />,
  );

test("a missing OTP shows accessible validation and focuses the input", async () => {
  const user = userEvent.setup();
  showVerification();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "6-digit code",
  );
  const otp = screen.getByLabelText("Verification code");
  expect(document.activeElement).toBe(otp);
  expect(otp.getAttribute("aria-invalid")).toBe("true");
  expect(state.verify).not.toHaveBeenCalled();
});

test.each(["/device?user_code=ABCD-EFGH", "https://outside.example", "/login"])(
  "successful verification safely continues to %s",
  async (redirectTo) => {
    const user = userEvent.setup();
    showVerification(redirectTo);
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(state.push).toHaveBeenCalledWith(
        redirectTo.startsWith("/device") ? redirectTo : "/dashboard",
      ),
    );
    expect(state.verify).toHaveBeenCalledWith({
      email: "developer@example.com",
      otp: "123456",
    });
    expect(state.success).toHaveBeenCalledWith(
      "Account verified successfully!",
    );
    expect(state.refresh).toHaveBeenCalledOnce();
  },
);

test("incorrect or expired codes stay below the input and can be retried", async () => {
  state.verify.mockResolvedValueOnce({
    error: { message: "Code expired. Request another code." },
  });
  const user = userEvent.setup();
  showVerification();
  await user.type(screen.getByLabelText("Verification code"), "123456");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Code expired. Request another code.",
  );
  expect(state.push).not.toHaveBeenCalled();
  expect(state.error).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(state.push).toHaveBeenCalledOnce());
});

test("verification network failures use a toast and clear the busy state", async () => {
  state.verify.mockRejectedValue(new Error("network unavailable"));
  const user = userEvent.setup();
  showVerification();
  await user.type(screen.getByLabelText("Verification code"), "123456");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(state.error).toHaveBeenCalledWith(
      expect.stringContaining("Please try again"),
    ),
  );
  expect(
    (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test("resending respects cooldown and recovers after a network error", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const user = userEvent.setup();
  showVerification();
  expect(
    (screen.getByRole("button", { name: "Resend (30)" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const { act } = await import("@testing-library/react");
  act(() => vi.advanceTimersByTime(30000));
  state.resend.mockRejectedValueOnce(new Error("network unavailable"));
  await user.click(screen.getByRole("button", { name: "Resend" }));
  expect(state.error).toHaveBeenCalledWith(
    expect.stringContaining("Please try again"),
  );
  expect(
    (screen.getByRole("button", { name: "Resend" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Resend" }));
  expect(state.resend).toHaveBeenLastCalledWith({
    email: "developer@example.com",
    type: "email-verification",
  });
  expect(state.success).toHaveBeenCalledWith("OTP email resent successfully!");
  expect(
    (screen.getByRole("button", { name: "Resend (30)" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("changing email returns to the auth form without submitting", async () => {
  const user = userEvent.setup();
  showVerification();
  await user.click(screen.getByRole("button", { name: "Change email" }));
  expect(state.setEmail).toHaveBeenCalledWith(null);
  expect(state.verify).not.toHaveBeenCalled();
});
