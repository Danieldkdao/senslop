// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicConnectionSchema } from "@senslop/contracts";
import { ConnectionForm } from "../components/connection-form";

const state = vi.hoisted(() => ({
  connections: [] as PublicConnectionSchema[],
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
