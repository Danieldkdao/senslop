// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicConnectionSchema } from "@senslop/contracts";
import { ConnectionForm } from "../components/connection-form";

const state = vi.hoisted(() => ({
  connections: [] as PublicConnectionSchema[],
  save: vi.fn(),
}));
vi.mock("../lib/requests", () => ({ providerRequest: state.save }));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    settings: { data: { connections: state.connections } },
    entries: [],
    refresh: vi.fn(),
  }),
}));
vi.mock("../components/provider-model-status", () => ({
  ProviderModelStatus: () => null,
}));
vi.mock("../../../components/provider-icon", () => ({
  ProviderIcon: () => null,
}));
afterEach(cleanup);

test("an open provider form receives CLI changes while preserving an unsaved endpoint draft", async () => {
  const connection: PublicConnectionSchema = {
    id: crypto.randomUUID(),
    provider: "ollama",
    name: "Ollama",
    baseURL: "http://localhost:11434",
    model: "",
    contextWindow: null,
    configured: false,
    credentialError: null,
    revision: 1,
  };
  state.connections = [connection];
  const view = render(
    <ConnectionForm provider="ollama" connection={connection} />,
  );
  state.connections = [
    { ...connection, baseURL: "http://localhost:1234", revision: 2 },
  ];
  view.rerender(<ConnectionForm provider="ollama" connection={connection} />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText("API base URL") as HTMLInputElement).value,
    ).toBe("http://localhost:1234"),
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("API base URL"));
  await user.type(
    screen.getByLabelText("API base URL"),
    "http://localhost:4567",
  );
  state.connections = [
    { ...connection, baseURL: "http://localhost:7890", revision: 3 },
  ];
  view.rerender(<ConnectionForm provider="ollama" connection={connection} />);
  expect(
    (screen.getByLabelText("API base URL") as HTMLInputElement).value,
  ).toBe("http://localhost:4567");
});

test("LM Studio exposes and saves the context length actually loaded by the server", async () => {
  state.connections = [];
  state.save.mockResolvedValue({
    connection: {
      id: crypto.randomUUID(),
      provider: "lm-studio",
      name: "LM Studio",
      baseURL: "http://localhost:1234/v1",
      model: "",
      contextWindow: 32768,
      configured: false,
      credentialError: null,
      revision: 1,
    },
  });
  const user = userEvent.setup();
  render(<ConnectionForm provider="lm-studio" />);
  await user.type(screen.getByLabelText("Context window"), "32768");
  await user.tab();
  await waitFor(() =>
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "save",
        connection: expect.objectContaining({
          provider: "lm-studio",
          contextWindow: 32768,
        }),
      }),
    ),
  );
});
