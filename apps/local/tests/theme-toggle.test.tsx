// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

let systemDark = true;

let systemListeners: ((event: { matches: boolean }) => void)[] = [];

vi.mock("@/components/ui/toast", () => ({ Toaster: () => null }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  systemListeners = [];
  systemDark = true;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: query === "(prefers-color-scheme: dark)" && systemDark,
      addListener: (listener: (event: { matches: boolean }) => void) => {
        if (query === "(prefers-color-scheme: dark)")
          systemListeners.push(listener);
      },
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const showToggle = () =>
  render(
    <Providers>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button aria-label="Choose appearance" />}>
          Appearance
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <ThemeToggle />
        </DropdownMenuContent>
      </DropdownMenu>
    </Providers>,
  );

test("the dropdown exposes three exclusive modes and marks the saved choice", async () => {
  localStorage.setItem("theme", "dark");
  const user = userEvent.setup();
  showToggle();
  await user.click(screen.getByRole("button", { name: "Choose appearance" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Change theme" }),
  );
  await screen.findByRole("menuitemradio", { name: "Light" });
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
  expect(
    screen
      .getByRole("menuitemradio", { name: "Dark" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.queryByRole("menuitemradio", { name: "Warm" })).toBeNull();
});

test.each([
  ["Light", "light"],
  ["Dark", "dark"],
  ["System", "system"],
])("%s selection changes and persists the theme", async (label, value) => {
  const user = userEvent.setup();
  showToggle();
  await user.click(screen.getByRole("button", { name: "Choose appearance" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Change theme" }),
  );
  (await screen.findByRole("menuitemradio", { name: label })).focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(localStorage.getItem("theme")).toBe(value));
  expect(
    document.documentElement.classList.contains(
      value === "system" ? "dark" : value,
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Choose appearance" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Change theme" }),
  );
  expect(
    (await screen.findByRole("menuitemradio", { name: label })).getAttribute(
      "aria-checked",
    ),
  ).toBe("true");
});

test("System follows OS changes while an explicit mode remains fixed", async () => {
  const user = userEvent.setup();
  showToggle();
  await waitFor(() =>
    expect(document.documentElement.classList.contains("dark")).toBe(true),
  );
  systemDark = false;
  act(() =>
    systemListeners.forEach((listener) => listener({ matches: false })),
  );
  expect(document.documentElement.classList.contains("light")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Choose appearance" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Change theme" }),
  );
  (await screen.findByRole("menuitemradio", { name: "Light" })).focus();
  await user.keyboard("{Enter}");
  act(() => systemListeners.forEach((listener) => listener({ matches: true })));
  expect(document.documentElement.classList.contains("light")).toBe(true);
});

test("keyboard selection and Escape return focus to the trigger", async () => {
  const user = userEvent.setup();
  showToggle();
  const trigger = screen.getByRole("button", { name: "Choose appearance" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  const submenu = await screen.findByRole("menuitem", { name: "Change theme" });
  await waitFor(() => expect(document.activeElement).toBe(submenu));
  await user.keyboard("{ArrowRight}");
  await screen.findByRole("menuitemradio", { name: "Light" });
  await user.keyboard("{Home}{Enter}");
  await waitFor(() => expect(localStorage.getItem("theme")).toBe("light"));
  await user.click(trigger);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
