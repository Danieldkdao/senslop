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
import { CompatibleProviderForm } from "../components/compatible-provider-form";
import { defaultCompatibleModel } from "../constants";

const state = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(async () => {}),
  connections: [] as object[],
}));
vi.mock("../lib/requests", () => ({ providerRequest: state.request }));
vi.mock("../hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    settings: { data: { connections: state.connections } },
    refresh: state.refresh,
  }),
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
beforeEach(() => {
  state.connections = [];
  state.request.mockReset();
  state.request.mockImplementation(async (body) =>
    body.action === "test"
      ? { supported: true, message: "Connection checked" }
      : {
          connection: {
            ...body.connection,
            id: crypto.randomUUID(),
            configured: true,
            credentialError: null,
          },
          warning: null,
        },
  );
});
afterEach(cleanup);

test("new compatible providers validate required fields before any request", async () => {
  render(<CompatibleProviderForm onCancel={vi.fn()} onSaved={vi.fn()} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save provider" }));
  expect(await screen.findByText("Name this connection.")).toBeTruthy();
  expect(
    screen.getByText("Enter the model name used by the API."),
  ).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
  expect(screen.getAllByRole("switch")).toHaveLength(7);
  expect(screen.queryByRole("checkbox")).toBeNull();
});

test("models can be added and removed, and valid settings save with capability toggles", async () => {
  const onSaved = vi.fn();
  render(<CompatibleProviderForm onCancel={vi.fn()} onSaved={onSaved} />);
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Provider name"),
    "My compatible server",
  );
  await user.type(
    screen.getByLabelText("API URL"),
    "https://api.custom.test/v1",
  );
  await user.type(screen.getByLabelText("API key"), "test-secret");
  await user.type(screen.getByLabelText("Model name"), "my-model");
  await user.click(screen.getByRole("button", { name: "Add model" }));
  expect(screen.getAllByLabelText("Model name")).toHaveLength(2);
  await user.click(
    within(screen.getByRole("group", { name: "Model 2" })).getByRole("button", {
      name: "Remove model",
    }),
  );
  await user.click(
    screen.getByRole("switch", { name: "Supports prompt_cache_key" }),
  );
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "save",
      connection: expect.objectContaining({
        provider: "openai-compatible",
        name: "My compatible server",
        apiKey: "test-secret",
        models: [
          expect.objectContaining({
            id: "my-model",
            supportsPromptCacheKey: true,
          }),
        ],
      }),
    }),
  );
});

test("invalid numeric limits show accessible errors and a missing key never saves", async () => {
  render(<CompatibleProviderForm onCancel={vi.fn()} onSaved={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Provider name"), "Custom");
  await user.type(screen.getByLabelText("API URL"), "https://custom.test/v1");
  await user.type(screen.getByLabelText("Model name"), "model");
  const input = screen.getByLabelText("Max output tokens");
  await user.clear(input);
  await user.type(input, "9999999");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  await user.clear(input);
  await user.type(input, "1000");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  expect(
    await screen.findByText("Enter an API key for this provider."),
  ).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
});

test("editing keeps the stored key, but changing the endpoint requires a replacement", async () => {
  const connection = {
    id: crypto.randomUUID(),
    provider: "openai-compatible" as const,
    name: "Existing",
    baseURL: "https://old.test/v1",
    configured: true,
    credentialError: null,
    model: "",
    contextWindow: null,
    models: [{ ...defaultCompatibleModel, id: "model" }],
  };
  const onSaved = vi.fn();
  const view = render(
    <CompatibleProviderForm
      connection={connection}
      onCancel={vi.fn()}
      onSaved={onSaved}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(state.request).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "save",
      connection: expect.objectContaining({ id: connection.id, apiKey: "" }),
    }),
  );
  view.unmount();
  state.request.mockClear();
  render(
    <CompatibleProviderForm
      connection={connection}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  const url = screen.getByLabelText("API URL");
  await user.clear(url);
  await user.type(url, "https://new.test/v1");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  expect(
    await screen.findByText("Enter a new API key when changing the API URL."),
  ).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
});
