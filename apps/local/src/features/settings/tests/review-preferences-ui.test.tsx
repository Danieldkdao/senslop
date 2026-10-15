// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewPreferences } from "../components/review-preferences";

const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPreferences />
    </QueryClientProvider>,
  );

test("the opt-in switch saves immediately and restores the saved preference on remount", async () => {
  let saved = { autoAdvance: false };
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method === "PUT") saved = JSON.parse(options.body);
    return Response.json(saved);
  });
  vi.stubGlobal("fetch", fetcher);
  mount();
  const toggle = await screen.findByRole("switch");
  await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await userEvent.setup().click(toggle);
  await waitFor(() => expect(saved.autoAdvance).toBe(true));
  cleanup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    ),
  );
});

test("a failed preference save restores the saved switch value and reports the failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      Response.json(
        { autoAdvance: false },
        { status: options?.method === "PUT" ? 503 : 200 },
      ),
    ),
  );
  mount();
  await waitFor(() =>
    expect(screen.getByRole("switch").hasAttribute("disabled")).toBe(false),
  );
  await userEvent.setup().click(screen.getByRole("switch"));
  await waitFor(() => expect(feedback.error).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
});
