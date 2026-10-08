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
import { UserMenu } from "@/components/user-menu";

const state = vi.hoisted(() => ({
  signOut: vi.fn(),
  session: {
    data: {
      user: {
        name: "Daniel Dao",
        email: "daniel@example.invalid",
        image: null,
      },
    } as { user: { name: string; email: string; image: null } } | null,
    isPending: false,
  },
  push: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: state.signOut, useSession: () => state.session },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { error: state.error } }));

const profile = {
  name: "Daniel Dao",
  email: "daniel@example.invalid",
  image: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  state.signOut.mockResolvedValue({ error: null });
  state.session = { data: { user: profile }, isPending: false };
});
afterEach(cleanup);

const openMenu = async () => {
  const user = userEvent.setup();
  render(<UserMenu />);
  await user.click(screen.getByRole("button", { name: "Open account menu" }));
  await screen.findByRole("menuitem", { name: "Settings" });
  return user;
};

test("the trigger shows photo fallback and name; the menu owns account details and actions", async () => {
  await openMenu();
  const trigger = screen.getByRole("button", { name: "Open account menu" });
  expect(within(trigger).getByText("DD")).toBeTruthy();
  expect(within(trigger).getByText("Daniel Dao")).toBeTruthy();
  expect(screen.getByText(profile.email)).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Change theme" })).toBeTruthy();
  expect(
    screen
      .getByRole("menuitem", { name: "Sign out" })
      .getAttribute("data-variant"),
  ).toBe("destructive");
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("Settings opens the account dialog and closing it restores focus", async () => {
  const user = await openMenu();
  await user.click(screen.getByRole("menuitem", { name: "Settings" }));
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  expect(within(dialog).getByText(profile.email)).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open account menu" }),
    ),
  );
});

test("sign-out navigates only after success", async () => {
  const user = await openMenu();
  await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  expect(state.refresh).toHaveBeenCalledOnce();
});

test.each(["returned error", "network failure"])(
  "sign-out %s keeps the account and permits retry",
  async (failure) => {
    if (failure === "returned error")
      state.signOut.mockResolvedValueOnce({
        error: { message: "Unavailable" },
      });
    else state.signOut.mockRejectedValueOnce(new Error("Offline"));
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith(
        "Sign-out failed. Please retry.",
      ),
    );
    expect(state.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  },
);

test("session loading stays inside the account menu, then renders the fetched account", () => {
  state.session = { data: null, isPending: true };
  const view = render(<UserMenu />);
  expect(
    (
      screen.getByRole("button", {
        name: "Loading account",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Open account menu" }),
  ).toBeNull();
  state.session = { data: { user: profile }, isPending: false };
  view.rerender(<UserMenu />);
  expect(
    screen.getByRole("button", { name: "Open account menu" }),
  ).toBeTruthy();
});

test("a missing session leaves the account menu empty", () => {
  state.session = { data: null, isPending: false };
  const { container } = render(<UserMenu />);
  expect(container.textContent).toBe("");
});
