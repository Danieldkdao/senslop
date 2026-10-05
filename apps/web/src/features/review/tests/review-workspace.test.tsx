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
import { ReviewWorkspace } from "../components/review-workspace";

const profile = {
  name: "Daniel Dao",
  email: "daniel@example.invalid",
  image: null,
};

const state = vi.hoisted(() => ({
  mobile: false,
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: state.signOut },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { error: state.toastError },
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.mobile = false;
  state.signOut.mockResolvedValue({ error: null });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("dashboard layout surrounds its content with honest empty review panels", () => {
  render(
    <ReviewWorkspace user={profile}>
      <p>Connection steps go here</p>
    </ReviewWorkspace>,
  );
  expect(
    within(screen.getByRole("main", { name: "Review canvas" })).getByText(
      "Connection steps go here",
    ),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("complementary", { name: "Review files" }),
    ).getByText("No files here yet"),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("complementary", { name: "Review notes" }),
    ).getByText("Select a file to start taking notes."),
  ).toBeTruthy();
  expect(screen.getByText("No file selected")).toBeTruthy();
  expect(
    screen.queryByRole("navigation", { name: "Main navigation" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Get started" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Open account menu" }),
  ).toBeTruthy();
});

test("desktop exposes two accessible sidebar resize handles", () => {
  render(<ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>);
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  screen
    .getAllByRole("separator")
    .forEach((handle) =>
      expect(handle.getAttribute("aria-orientation")).toBe("vertical"),
    );
});

test("mobile hides sidebars and handles until a drawer is requested", async () => {
  state.mobile = true;
  const user = userEvent.setup();
  render(<ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>);
  expect(
    screen.queryByRole("complementary", { name: "Review files" }),
  ).toBeNull();
  expect(
    screen.queryByRole("complementary", { name: "Review notes" }),
  ).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open files" }));
  const files = await screen.findByRole("dialog", { name: "Files" });
  expect(within(files).getByText("No files here yet")).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open files" }),
  );
  await user.click(screen.getByRole("button", { name: "Open notes" }));
  const notes = await screen.findByRole("dialog", {
    name: "Notes and account",
  });
  expect(
    within(notes).getByText("Select a file to start taking notes."),
  ).toBeTruthy();
  expect(
    within(notes).getByRole("button", { name: "Open account menu" }),
  ).toBeTruthy();
  await user.click(within(notes).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open notes" }),
  );
});

test("changing to desktop unmounts an open mobile drawer", async () => {
  state.mobile = true;
  const user = userEvent.setup();
  const view = render(
    <ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>,
  );
  await user.click(screen.getByRole("button", { name: "Open notes" }));
  await screen.findByRole("dialog", { name: "Notes and account" });
  state.mobile = false;
  view.rerender(<ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Open notes" })).toBeNull();
});

test("sign-out returns to login after the server confirms it", async () => {
  const user = userEvent.setup();
  render(<ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>);
  // JSDOM has no resize hitboxes; use keyboard activation here.
  const account = screen.getByRole("button", { name: "Open account menu" });
  account.focus();
  await user.keyboard("{ArrowDown}");
  (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  expect(state.refresh).toHaveBeenCalledOnce();
});

test.each(["returned error", "network failure"])(
  "sign-out %s keeps the workspace open and permits retry",
  async (failure) => {
    if (failure === "returned error")
      state.signOut.mockResolvedValueOnce({
        error: { message: "Unavailable" },
      });
    else state.signOut.mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    render(<ReviewWorkspace user={profile}>Setup steps</ReviewWorkspace>);
    // JSDOM has no resize hitboxes; use keyboard activation here.
    const account = screen.getByRole("button", { name: "Open account menu" });
    account.focus();
    await user.keyboard("{ArrowDown}");
    (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
    await user.keyboard("{Enter}");
    expect(state.toastError).toHaveBeenCalledWith(
      "Sign-out failed. Please retry.",
    );
    expect(state.push).not.toHaveBeenCalled();
    account.focus();
    await user.keyboard("{ArrowDown}");
    (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  },
);
