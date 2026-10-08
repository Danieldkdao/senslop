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
import { AuthForm } from "@/components/auth/auth-form";

const state = vi.hoisted(() => ({
  redirect: "/dashboard",
  social: vi.fn(),
  email: vi.fn(),
  signup: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  verificationEmail: null as string | null,
}));

vi.mock("@/components/ui/toast", () => ({
  toast: { error: state.toastError },
}));
vi.mock("@/components/auth/verify-account", () => ({
  VerifyAccount: ({
    email,
    setEmail,
    redirectTo,
  }: {
    email: string;
    setEmail: (email: null) => void;
    redirectTo: string;
  }) => (
    <section aria-label="Verify account">
      <p>{email}</p>
      <p>{redirectTo}</p>
      <button onClick={() => setEmail(null)}>Change email</button>
    </section>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({
      redirect: state.redirect,
      ...(state.verificationEmail
        ? { verify: "1", email: state.verificationEmail }
        : {}),
    }),
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signIn: { social: state.social, email: state.email },
    signUp: { email: state.signup },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.redirect = "/dashboard";
  state.verificationEmail = null;
  state.social.mockResolvedValue({ data: { redirect: true }, error: null });
  state.email.mockResolvedValue({ error: null });
  state.signup.mockResolvedValue({ error: null });
});

afterEach(cleanup);

test.each([
  ["Google", "google", "/device?user_code=ABCD-EFGH"],
  ["GitHub", "github", "/device?user_code=ABCD-EFGH"],
  ["Google", "google", "https://outside.example/steal"],
])(
  "%s sign-in preserves a safe continuation",
  async (label, provider, redirect) => {
    state.redirect = redirect;
    const user = userEvent.setup();
    render(<AuthForm />);
    await user.click(
      screen.getByRole("button", { name: `Continue with ${label}` }),
    );

    await waitFor(() => {
      expect(state.social).toHaveBeenCalledWith({
        provider,
        callbackURL: redirect.startsWith("/") ? redirect : "/dashboard",
      });
    });
    expect(state.push).not.toHaveBeenCalled();
  },
);

test("social provider errors stay visible and allow retry", async () => {
  state.social.mockResolvedValue({
    error: { message: "Provider unavailable" },
  });
  const user = userEvent.setup();
  render(<AuthForm />);
  const google = screen.getByRole("button", { name: "Continue with Google" });
  await user.click(google);

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith("Provider unavailable"),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect((google as HTMLButtonElement).disabled).toBe(false);
  expect(state.push).not.toHaveBeenCalled();
});

test("social network failures show recovery feedback", async () => {
  state.social.mockRejectedValue(new Error("network unavailable"));
  const user = userEvent.setup();
  render(<AuthForm signup />);
  await user.click(
    screen.getByRole("button", { name: "Continue with GitHub" }),
  );

  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Please try again"),
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

test("password sign-in keeps the device continuation", async () => {
  state.redirect = "/device?user_code=ABCD-EFGH";
  const user = userEvent.setup();
  render(<AuthForm />);
  await user.type(screen.getByLabelText("Email"), "developer@example.com");
  await user.type(screen.getByLabelText("Password"), "a-long-test-password");
  const submit = screen.getByRole("button", { name: "Continue" });
  expect((submit as HTMLButtonElement).type).toBe("submit");
  await user.click(submit);

  await waitFor(() => expect(state.push).toHaveBeenCalledWith(state.redirect));
  expect(state.email).toHaveBeenCalledWith({
    email: "developer@example.com",
    password: "a-long-test-password",
  });
});

test("invalid email gets an accessible field error without calling auth", async () => {
  const user = userEvent.setup();
  render(<AuthForm />);
  await user.type(screen.getByLabelText("Email"), "not-an-email");
  await user.type(screen.getByLabelText("Password"), "a-long-test-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Enter a valid email address.",
  );
  const email = screen.getByLabelText("Email");
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(email.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Enter a valid email address.");
  expect(document.activeElement).toBe(email);
  expect(state.email).not.toHaveBeenCalled();
  await user.clear(email);
  await user.type(email, "developer@example.com");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(state.email).toHaveBeenCalledOnce());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("password validation explains the length requirement", async () => {
  const user = userEvent.setup();
  render(<AuthForm />);
  await user.type(screen.getByLabelText("Email"), "developer@example.com");
  await user.type(screen.getByLabelText("Password"), "short");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Use at least 12 characters.",
  );
  expect(state.email).not.toHaveBeenCalled();
});

test("signup rejects a whitespace-only name", async () => {
  const user = userEvent.setup();
  render(<AuthForm signup />);
  await user.type(screen.getByLabelText("Your name"), "   ");
  await user.type(screen.getByLabelText("Email"), "developer@example.com");
  await user.type(screen.getByLabelText("Password"), "a-long-test-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect((await screen.findByRole("alert")).textContent).toBe(
    "Enter your name.",
  );
  expect(state.signup).not.toHaveBeenCalled();
});

test("signup trims name and email but preserves password and continuation", async () => {
  state.redirect = "/device?user_code=ABCD-EFGH";
  const user = userEvent.setup();
  render(<AuthForm signup />);
  await user.type(screen.getByLabelText("Your name"), "  Daniel  ");
  await user.type(screen.getByLabelText("Email"), "  developer@example.com  ");
  await user.type(
    screen.getByLabelText("Password"),
    "  a-long-test-password  ",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));

  await waitFor(() =>
    expect(state.signup).toHaveBeenCalledWith({
      name: "Daniel",
      email: "developer@example.com",
      password: "  a-long-test-password  ",
    }),
  );
  expect(
    await screen.findByRole("region", { name: "Verify account" }),
  ).toBeTruthy();
  expect(screen.getByText(state.redirect)).toBeTruthy();
  expect(state.push).not.toHaveBeenCalled();
});

test("backend errors are shown and a pending submission cannot be repeated", async () => {
  let resolve: (value: { error: { message: string } }) => void = () => {};
  state.email.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  render(<AuthForm />);
  await user.type(screen.getByLabelText("Email"), "developer@example.com");
  await user.type(screen.getByLabelText("Password"), "a-long-test-password");
  const submit = screen.getByRole("button", { name: "Continue" });
  await user.click(submit);
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  expect(within(submit).getByRole("status", { name: "Loading" })).toBeTruthy();
  await user.click(submit);
  expect(state.email).toHaveBeenCalledOnce();
  resolve({ error: { message: "Invalid account details" } });
  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith("Invalid account details"),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  expect(state.push).not.toHaveBeenCalled();
});

test("password visibility preserves the value without submitting", async () => {
  const user = userEvent.setup();
  render(<AuthForm />);
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  await user.type(password, "my-secret-password");
  expect(password.type).toBe("password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(password.type).toBe("text");
  expect(password.value).toBe("my-secret-password");
  expect(
    screen
      .getByRole("button", { name: "Hide password" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password.type).toBe("password");
  expect(state.email).not.toHaveBeenCalled();
});

test("password strength responds to common and stronger passwords", async () => {
  const user = userEvent.setup();
  render(<AuthForm signup />);
  const password = screen.getByLabelText("Password");
  const meter = screen.getByRole("progressbar", { name: "Password Strength" });
  expect(meter.getAttribute("aria-valuenow")).toBe("0");
  await user.type(password, "passwordpassword");
  expect(meter.getAttribute("aria-valuetext")).toBe("Very weak");
  const weakValue = Number(meter.getAttribute("aria-valuenow"));
  await user.clear(password);
  await user.type(password, "maple-cobalt-orbit-97!river");
  expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThan(
    weakValue,
  );
  expect(meter.getAttribute("aria-valuetext")).toBe("Very strong");
  await user.clear(password);
  expect(meter.getAttribute("aria-valuenow")).toBe("0");
});

test("account switching preserves the CLI continuation", async () => {
  state.redirect = "/device?user_code=ABCD-EFGH";
  render(<AuthForm />);
  expect(
    screen.getByRole("link", { name: "Sign up here" }).getAttribute("href"),
  ).toBe("/signup?redirect=%2Fdevice%3Fuser_code%3DABCD-EFGH");
  cleanup();
  render(<AuthForm signup />);
  expect(
    screen.getByRole("link", { name: "Sign in here" }).getAttribute("href"),
  ).toBe("/login?redirect=%2Fdevice%3Fuser_code%3DABCD-EFGH");
});

test.each([false, true])(
  "an unverified email response opens verification for signup=%s",
  async (signup) => {
    (signup ? state.signup : state.email).mockResolvedValue({
      error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    const user = userEvent.setup();
    render(<AuthForm signup={signup} />);
    if (signup) await user.type(screen.getByLabelText("Your name"), "Daniel");
    await user.type(screen.getByLabelText("Email"), "developer@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-test-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("region", { name: "Verify account" }),
    ).toBeTruthy();
    expect(screen.getByText("developer@example.com")).toBeTruthy();
    expect(state.toastError).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Change email" }));
    expect(screen.getByLabelText("Email")).toBeTruthy();
  },
);

test("an old unverified session opens the verification requested by proxy", () => {
  state.verificationEmail = "developer@example.com";
  render(<AuthForm />);
  expect(screen.getByRole("region", { name: "Verify account" })).toBeTruthy();
  expect(screen.getByText("developer@example.com")).toBeTruthy();
});

test("password network failures use the toast system", async () => {
  state.email.mockRejectedValue(new Error("service unavailable"));
  const user = userEvent.setup();
  render(<AuthForm />);
  await user.type(screen.getByLabelText("Email"), "developer@example.com");
  await user.type(screen.getByLabelText("Password"), "a-long-test-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(state.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Please try again"),
    ),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

test("only the pending social sign-in displays loading while all submission buttons are disabled", async () => {
  let finish!: (value: { error: null }) => void;
  state.social.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<AuthForm />);
  const google = screen.getByRole("button", { name: "Continue with Google" });
  const github = screen.getByRole("button", { name: "Continue with GitHub" });
  await user.click(google);
  expect((google as HTMLButtonElement).disabled).toBe(true);
  expect((github as HTMLButtonElement).disabled).toBe(true);
  expect(within(google).getByRole("status", { name: "Loading" })).toBeTruthy();
  expect(within(github).queryByRole("status")).toBeNull();
  finish({ error: null });
  await waitFor(() =>
    expect((google as HTMLButtonElement).disabled).toBe(false),
  );
});
