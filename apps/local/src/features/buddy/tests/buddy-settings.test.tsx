// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BuddySettings } from "../components/buddy-settings";
import { BuddyProvider } from "../components/buddy-provider";
import { defaultUiPreferences } from "../../settings/constants";
import { mergeUiPreferences } from "../../settings/lib/ui-preferences";

vi.mock("@/components/ui/toast", () => ({ toast: { error: vi.fn() } }));
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("buddy options preview on hover and keyboard focus, cancel quietly, and save only on selection", async () => {
  let saved = defaultUiPreferences;
  const patches: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH") {
        const patch = JSON.parse(options.body);
        patches.push(patch);
        saved = mergeUiPreferences(saved, patch);
      }
      return Response.json(saved);
    }),
  );
  const user = userEvent.setup();
  const mount = () =>
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <BuddyProvider>
          <BuddySettings />
        </BuddyProvider>
      </QueryClientProvider>,
    );
  const { unmount } = mount();
  const select = screen.getByRole("combobox", { name: "Buddy" });
  await waitFor(() => expect(select.hasAttribute("disabled")).toBe(false));
  await user.click(select);
  expect(await screen.findAllByRole("option")).toHaveLength(5);
  await user.hover(screen.getByRole("option", { name: "Momo" }));
  expect(screen.getByRole("img", { name: "Momo preview" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /move pip/i })).toBeTruthy();
  expect(patches).toHaveLength(0);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("img", { name: "Pip preview" })).toBeTruthy();
  await user.click(select);
  await screen.findByRole("option", { name: "Pip" });
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("img", { name: "Momo preview" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(patches).toHaveLength(0);
  await user.click(select);
  const lumi = await screen.findByRole("option", { name: "Lumi" });
  await user.hover(lumi);
  await user.click(lumi);
  await waitFor(() => expect(saved.buddy.character).toBe("lumi"));
  expect(screen.getByRole("img", { name: "Lumi preview" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /move lumi/i })).toBeTruthy();
  expect(patches).toHaveLength(1);
  unmount();
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Buddy" }).textContent,
    ).toContain("Lumi"),
  );
  expect(screen.getByRole("img", { name: "Lumi preview" })).toBeTruthy();
});
test("visibility, animation pause, and position reset save independently of the theme", async () => {
  let saved = {
    ...defaultUiPreferences,
    buddy: {
      ...defaultUiPreferences.buddy,
      visible: true,
      animations: true,
      position: { x: 0.2, y: 0.4 } as { x: number; y: number } | null,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH")
        saved = mergeUiPreferences(saved, JSON.parse(options.body));
      return Response.json(saved);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <BuddySettings />
    </QueryClientProvider>,
  );
  const visible = screen.getByRole("switch", { name: "Show buddy" });
  await waitFor(() =>
    expect(visible.hasAttribute("data-disabled")).toBe(false),
  );
  expect(screen.getByRole("img", { name: "Pip preview" })).toBeTruthy();
  const size = screen.getByRole("spinbutton", { name: "Buddy size" });
  expect(size.getAttribute("min")).toBe("80");
  expect(size.getAttribute("max")).toBe("120");
  await user.clear(size);
  await user.type(size, "120");
  await user.tab();
  await waitFor(() => expect(saved.buddy.size).toBe(120));
  expect(
    screen.getByRole("img", { name: "Pip preview" }).querySelector("canvas")
      ?.width,
  ).toBe(120);
  await user.click(visible);
  await waitFor(() => expect(saved.buddy.visible).toBe(false));
  expect(screen.queryByRole("img", { name: "Pip preview" })).toBeNull();
  await user.click(screen.getByRole("switch", { name: "Animate buddy" }));
  await waitFor(() => expect(saved.buddy.animations).toBe(false));
  await user.click(
    screen.getByRole("button", { name: "Reset buddy position" }),
  );
  await waitFor(() => expect(saved.buddy.position).toBeNull());
  expect(saved.buddy.visible).toBe(false);
  expect(saved.buddy.size).toBe(120);
  expect(saved.applicationTheme).toBe(defaultUiPreferences.applicationTheme);
  await user.click(visible);
  await waitFor(() =>
    expect(screen.getByRole("img", { name: "Pip preview" })).toBeTruthy(),
  );
  expect(
    screen
      .getByRole("spinbutton", { name: "Buddy size" })
      .getAttribute("value"),
  ).toBe("120");
  await user.clear(screen.getByRole("spinbutton", { name: "Buddy size" }));
  await user.type(
    screen.getByRole("spinbutton", { name: "Buddy size" }),
    "150",
  );
  await user.tab();
  await waitFor(() => expect(saved.buddy.size).toBe(120));
  expect(
    screen
      .getByRole("spinbutton", { name: "Buddy size" })
      .getAttribute("aria-invalid"),
  ).toBeNull();
});
