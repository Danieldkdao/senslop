// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProviderModelStatus } from "../components/provider-model-status";
import type { useProviderModels } from "../hooks/use-provider-models";

type Entry = ReturnType<typeof useProviderModels>["entries"][number];
const connection: Entry["connection"] = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "google",
  name: "Google",
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
  model: "",
  contextWindow: null,
  configured: true,
  credentialError: null,
};
const entry = (overrides: Partial<Entry> = {}): Entry =>
  ({
    connection,
    pending: false,
    fetching: false,
    error: null,
    catalog: {
      models: [{ id: "gemini", name: "Gemini", available: true }],
      source: "live",
      manualAllowed: false,
      message: null,
    },
    refetch: vi.fn(),
    ...overrides,
  }) as Entry;
afterEach(cleanup);

test("available live models show a success icon and tooltip with a refresh action", async () => {
  const value = entry();
  render(
    <TooltipProvider>
      <ProviderModelStatus connection={connection} entry={value} />
    </TooltipProvider>,
  );
  const status = screen.getByRole("button", {
    name: "Google: models available",
  });
  expect(status.querySelector("svg")?.classList.contains("text-success")).toBe(
    true,
  );
  const user = userEvent.setup();
  await user.hover(status);
  expect((await screen.findByText(/1 model found/)).textContent).toContain(
    "1 model found",
  );
  await user.click(
    screen.getByRole("button", { name: "Refresh Google models" }),
  );
  expect(value.refetch).toHaveBeenCalledOnce();
  expect(screen.queryByText("Model discovery")).toBeNull();
});

test("provider errors appear only in the destructive status tooltip", async () => {
  render(
    <TooltipProvider>
      <ProviderModelStatus
        connection={connection}
        entry={entry({
          catalog: undefined,
          error: new Error("Server unavailable or timed out."),
        })}
      />
    </TooltipProvider>,
  );
  const status = screen.getByRole("button", {
    name: "Google: model check failed",
  });
  expect(
    status.querySelector("svg")?.classList.contains("text-destructive"),
  ).toBe(true);
  expect(screen.queryByText("Server unavailable or timed out.")).toBeNull();
  await userEvent.setup().hover(status);
  expect(
    (await screen.findByText("Server unavailable or timed out.")).textContent,
  ).toContain("Server unavailable or timed out.");
});

test.each([null, new Error("Earlier check failed")])(
  "refreshing a cached catalog spins and disables refresh even after error %s",
  (error) => {
    render(
      <TooltipProvider>
        <ProviderModelStatus
          connection={connection}
          entry={entry({ fetching: true, error })}
        />
      </TooltipProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "Google: checking models" })
        .querySelector("svg")
        ?.classList.contains("animate-spin"),
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Refresh Google models",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);

test("curated fallback models and empty catalogs are not reported as verified success", () => {
  const value = entry();
  value.catalog = {
    ...value.catalog!,
    source: "curated",
    message: "Account availability could not be verified.",
  };
  const { rerender } = render(
    <TooltipProvider>
      <ProviderModelStatus connection={connection} entry={value} />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Google: model check failed" }),
  ).toBeTruthy();
  rerender(
    <TooltipProvider>
      <ProviderModelStatus
        connection={connection}
        entry={entry({
          catalog: {
            ...value.catalog,
            source: "live",
            models: [],
            message: null,
          },
        })}
      />
    </TooltipProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Google: model check failed" }),
  ).toBeTruthy();
});

test("credential errors remain actionable without a catalog query", async () => {
  const refresh = vi.fn();
  render(
    <TooltipProvider>
      <ProviderModelStatus
        connection={{
          ...connection,
          credentialError: "Unlock your OS credential store.",
        }}
        onRefresh={refresh}
      />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.hover(
    screen.getByRole("button", { name: "Google: model check failed" }),
  );
  expect(
    (await screen.findByText("Unlock your OS credential store.")).textContent,
  ).toContain("Unlock your OS credential store.");
  await user.click(
    screen.getByRole("button", { name: "Refresh Google models" }),
  );
  expect(refresh).toHaveBeenCalledOnce();
});
