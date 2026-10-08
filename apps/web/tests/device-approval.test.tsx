// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceApproval } from "@/components/auth/device-approval";
import DevicePage from "@/app/device/page";

const state = vi.hoisted(() => ({
  signedIn: true,
  verify: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

vi.mock("@/components/ui/toast", () => ({
  toast: { error: state.toastError },
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: state.signedIn ? { user: { id: "test-user" } } : null,
      isPending: false,
    }),
    device: Object.assign(state.verify, {
      approve: state.approve,
      deny: state.deny,
    }),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.signedIn = true;
  state.verify.mockResolvedValue({
    data: { client_id: "senslop-cli" },
    error: null,
  });
  state.approve.mockResolvedValue({ error: null });
  state.deny.mockResolvedValue({ error: null });
});

afterEach(cleanup);

test("empty device code explains the validation error without a request", async () => {
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.click(screen.getByRole("button", { name: "Check code" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Enter the code shown in your terminal.",
  );
  const code = screen.getByLabelText("Code shown in your terminal");
  expect(code.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(code.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Enter the code shown in your terminal.");
  expect(document.activeElement).toBe(code);
  expect(state.verify).not.toHaveBeenCalled();
});

test("an overlong device code is rejected locally", async () => {
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "A".repeat(33),
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Use no more than 32 characters.",
  );
  expect(state.verify).not.toHaveBeenCalled();
});

test("manually entered device code is trimmed, uppercased and still needs explicit approval", async () => {
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "  abcd-efgh  ",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));
  const approve = await screen.findByRole("button", {
    name: "Approve",
  });

  expect(state.verify).toHaveBeenCalledWith({
    query: { user_code: "ABCD-EFGH" },
  });
  expect(state.approve).not.toHaveBeenCalled();
  await user.click(approve);
  await waitFor(() =>
    expect(state.approve).toHaveBeenCalledWith({ userCode: "ABCD-EFGH" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "Computer approved",
  );
});

test("editing a checked code requires verification again before denial", async () => {
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "ABCD-EFGH",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await screen.findByRole("button", { name: "Approve" });
  const code = screen.getByLabelText("Code shown in your terminal");
  await user.clear(code);
  await user.type(code, "WXYZ-1234");

  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await user.click(await screen.findByRole("button", { name: "Deny" }));
  expect(state.deny).toHaveBeenCalledWith({ userCode: "WXYZ-1234" });
});

test("signed-out verification returns to manual device entry", async () => {
  state.signedIn = false;
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "  abcd-efgh  ",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));

  await waitFor(() =>
    expect(state.push).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent("/device")}`,
    ),
  );
  expect(state.verify).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Check code" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test("verification service failures remain retryable", async () => {
  state.verify.mockRejectedValueOnce(new Error("network unavailable"));
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "ABCD-EFGH",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith(
      "Couldn’t verify the code. Please try again.",
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await screen.findByRole("button", { name: "Approve" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("invalid returned device codes stay inline", async () => {
  state.verify.mockResolvedValueOnce({
    error: { status: 400, error: "invalid_request" },
  });
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "ABCD-EFGH",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "This code is invalid, expired",
  );
  expect(state.toastError).not.toHaveBeenCalled();
});

test("returned verification service errors use toasts and permit retry", async () => {
  state.verify.mockResolvedValueOnce({ error: { status: 503 } });
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "ABCD-EFGH",
  );
  await user.click(screen.getByRole("button", { name: "Check code" }));

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith(
      "Couldn’t verify the code. Please try again.",
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await screen.findByRole("button", { name: "Approve" });
});

test.each([
  { action: "Approve", failure: "returned" },
  { action: "Approve", failure: "network" },
  { action: "Deny", failure: "returned" },
  { action: "Deny", failure: "network" },
])(
  "$action $failure errors use toasts and remain retryable",
  async ({ action, failure }) => {
    const request = action === "Approve" ? state.approve : state.deny;
    if (failure === "returned")
      request.mockResolvedValueOnce({
        error: {
          error_description: "Authorization unavailable. Please retry.",
        },
      });
    else request.mockRejectedValueOnce(new Error("network unavailable"));
    const user = userEvent.setup();
    render(<DeviceApproval />);
    await user.type(
      screen.getByLabelText("Code shown in your terminal"),
      "ABCD-EFGH",
    );
    await user.click(screen.getByRole("button", { name: "Check code" }));
    await user.click(await screen.findByRole("button", { name: action }));

    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith(
        failure === "returned"
          ? "Authorization unavailable. Please retry."
          : "Account service unavailable. Please retry.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(screen.getByRole("button", { name: action }));
    expect((await screen.findByRole("status")).textContent).toContain(
      action === "Approve" ? "Computer approved" : "Connection denied",
    );
  },
);

test("device page ignores URL codes and waits for manual entry before verification", async () => {
  window.history.replaceState({}, "", "/device?user_code=ABCD-EFGH");
  const user = userEvent.setup();
  render(<DevicePage />);

  const code = screen.getByLabelText(
    "Code shown in your terminal",
  ) as HTMLInputElement;
  expect(code.value).toBe("");
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
  expect(state.verify).not.toHaveBeenCalled();
  expect(state.approve).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Check code" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Enter the code shown in your terminal.",
  );
  expect(state.verify).not.toHaveBeenCalled();
  await user.type(code, "ABCD-EFGH");
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await screen.findByRole("button", { name: "Approve" });
  expect(state.verify).toHaveBeenCalledWith({
    query: { user_code: "ABCD-EFGH" },
  });
  expect(state.approve).not.toHaveBeenCalled();
});

test("checking a code shows loading and prevents a duplicate request", async () => {
  let finish!: (value: { data: { client_id: string }; error: null }) => void;
  state.verify.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<DeviceApproval />);
  await user.type(
    screen.getByLabelText("Code shown in your terminal"),
    "ABCD-EFGH",
  );
  const check = screen.getByRole("button", { name: "Check code" });
  await user.click(check);
  expect((check as HTMLButtonElement).disabled).toBe(true);
  expect(within(check).getByRole("status", { name: "Loading" })).toBeTruthy();
  await user.click(check);
  expect(state.verify).toHaveBeenCalledOnce();
  finish({ data: { client_id: "senslop-cli" }, error: null });
  await screen.findByRole("button", { name: "Approve" });
});
