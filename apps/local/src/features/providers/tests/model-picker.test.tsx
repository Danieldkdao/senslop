// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { CatalogModelSchema, ModelSelection } from "../model-schemas";
import { ModelPicker } from "../components/model-picker";

const state = vi.hoisted(() => ({
  entries: [] as unknown[],
  refresh: vi.fn(),
  retry: vi.fn(),
  defaultId: null as string | null,
}));
vi.mock("../hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    entries: state.entries,
    settings: {
      data: {
        connections: state.entries.map(
          (entry) => (entry as { connection: unknown }).connection,
        ),
        defaultId: state.defaultId,
      },
      isPending: false,
      error: null,
      refetch: state.retry,
    },
    refresh: state.refresh,
  }),
}));
vi.mock("../../../components/provider-icon", () => ({
  ProviderIcon: ({ name }: { name: string }) => (
    <span data-testid={`icon-${name}`} />
  ),
}));
vi.mock("../../settings/components/provider-settings-dialog", () => ({
  ProviderSettingsDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        <button onClick={() => onOpenChange(false)}>Close settings</button>
      </div>
    ) : null,
}));
afterEach(() => {
  cleanup();
  state.entries = [];
  state.defaultId = null;
  vi.clearAllMocks();
});

const entry = (
  provider: string,
  id: string,
  name: string,
  modelId: string,
  modelName: string,
) => ({
  connection: {
    id,
    provider,
    name,
    baseURL: "https://test.example/v1",
    model: "",
    contextWindow: null,
    configured: true,
    credentialError: null,
  },
  catalog: {
    models: [
      { id: modelId, name: modelName, available: true },
    ] as CatalogModelSchema[],
    source: "live",
    message: null,
    manualAllowed: false,
  },
  pending: false,
  error: null,
  refetch: state.retry,
});
const Harness = () => {
  const [value, setValue] = useState<ModelSelection | null>(null);
  return (
    <>
      <ModelPicker value={value} onChange={setValue} />
      <output data-connection-id={value?.connectionId}>{value?.modelId}</output>
    </>
  );
};

test("duplicate payload rows collapse while the same model on separate connections stays selectable", async () => {
  const first = entry(
    "mistral",
    "first",
    "Personal",
    "mistral-small",
    "Mistral Small",
  );
  first.catalog.models.push({ ...first.catalog.models[0] });
  state.entries = [
    first,
    entry("mistral", "second", "Work", "mistral-small", "Mistral Small"),
  ];
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  expect(
    await screen.findAllByRole("option", { name: /Mistral Small/ }),
  ).toHaveLength(2);
  expect(
    screen.getByRole("option", { name: "Mistral Small (Personal)" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("option", { name: "Mistral Small (Work)" }),
  );
  expect(
    screen.getByRole("combobox", { name: "Model: Mistral Small (Work)" }),
  ).toBeTruthy();
  expect(screen.getByRole("status").getAttribute("data-connection-id")).toBe(
    "second",
  );
});

test("equal connection names still have distinct model choices", async () => {
  state.entries = [
    entry("ollama", "first", "Ollama", "local-model", "Local Model"),
    entry("ollama", "second", "Ollama", "local-model", "Local Model"),
  ];
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  expect(
    await screen.findByRole("option", { name: "Local Model (Ollama 1)" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("option", { name: "Local Model (Ollama 2)" }),
  );
  expect(screen.getByRole("status").getAttribute("data-connection-id")).toBe(
    "second",
  );
});

test("saved alias defaults remain selected, searchable, and preserve their requested ID", async () => {
  const saved = entry(
    "mistral",
    "first",
    "Personal",
    "ministral-8b-2512",
    "Ministral 8B",
  );
  saved.connection.model = "ministral-8b-latest";
  saved.catalog.models = [
    {
      ...saved.catalog.models[0],
      aliases: ["ministral-8b-latest"],
    },
  ];
  state.entries = [saved];
  state.defaultId = "first";
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = await screen.findByRole("combobox", { name: /Ministral 8B/ });
  expect(screen.getByRole("status").textContent).toBe("ministral-8b-latest");
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await user.type(
    screen.getByRole("combobox", { name: "Search models" }),
    "ministral-8b-latest",
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("option", { name: /Ministral 8B/ })
        .getAttribute("aria-selected"),
    ).toBe("true"),
  );
});

test("groups by connection provider, filters names and IDs, and selects by keyboard", async () => {
  state.entries = [
    entry(
      "openrouter",
      "00000000-0000-4000-8000-000000000001",
      "Router",
      "openai/gpt-5.4",
      "GPT 5.4",
    ),
    entry(
      "google",
      "00000000-0000-4000-8000-000000000002",
      "Google",
      "gemini-3.1-pro",
      "Gemini Pro",
    ),
  ];
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  expect(await screen.findByText("OpenRouter")).toBeTruthy();
  expect(screen.getByText("Google")).toBeTruthy();
  expect(screen.getByTestId("icon-OpenRouter")).toBeTruthy();
  await user.type(
    screen.getByRole("combobox", { name: "Search models" }),
    "openai/gpt",
  );
  await waitFor(() =>
    expect(screen.queryByRole("option", { name: /Gemini Pro/ })).toBeNull(),
  );
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: /GPT 5.4/ })).toBeTruthy(),
  );
  expect(screen.getByRole("status").textContent).toBe("openai/gpt-5.4");
});

test("Configure remains available in an empty picker and refreshes after settings close", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  await user.click(await screen.findByRole("button", { name: "Configure" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(state.refresh).toHaveBeenCalledTimes(1);
});

test("failed catalogs keep their provider group and a brief message without detailed footer errors", async () => {
  const failed = {
    ...entry(
      "ollama",
      "00000000-0000-4000-8000-000000000003",
      "Local",
      "unused",
      "Unused",
    ),
    catalog: undefined,
    error: new Error("Provider returned invalid or oversized model metadata."),
  };
  state.entries = [failed];
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  expect(await screen.findByText("Ollama")).toBeTruthy();
  expect(
    screen
      .getByRole("option", { name: /Models unavailable. Check Configure./ })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.queryByText(/invalid or oversized/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry models" })).toBeNull();
});

test("manual entry uses a saved connection and exact validated ID", async () => {
  const local = entry(
    "llama-cpp",
    "00000000-0000-4000-8000-000000000003",
    "Local",
    "unused",
    "Unused",
  );
  local.catalog = {
    ...local.catalog,
    models: [],
    source: "manual",
    manualAllowed: true,
  };
  state.entries = [local];
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: /Select a model/ }));
  await user.click(
    await screen.findByRole("button", { name: "Enter model ID" }),
  );
  await user.type(screen.getByLabelText("Model ID"), "my-local-model");
  await user.click(screen.getByRole("button", { name: "Use model" }));
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: /My Local Model/ }),
    ).toBeTruthy(),
  );
});
