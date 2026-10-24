// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PublicConnectionSchema } from "@senslop/contracts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { ProviderSettings } from "../components/provider-settings";
import { ConnectionForm } from "../components/connection-form";

vi.mock("../../../components/provider-icon", () => ({
  ProviderIcon: () => <span />,
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const id = "00000000-0000-4000-8000-000000000001";
const connection = (
  provider: "ollama" | "openrouter" = "ollama",
): PublicConnectionSchema => ({
  id,
  provider,
  name: provider === "ollama" ? "Ollama" : "OpenRouter",
  baseURL:
    provider === "ollama"
      ? "http://localhost:11434"
      : "https://openrouter.ai/api/v1",
  model: "",
  contextWindow: null,
  configured: provider !== "ollama",
  credentialError: null,
  revision: 0,
});
const catalog = {
  models: [{ id: "review-model", name: "Review model", available: true }],
  source: "live",
  manualAllowed: false,
  message: null,
};
const setup = (connections: PublicConnectionSchema[] = []) => {
  const state = {
    connections,
    defaultId: null as string | null,
    cleanupPending: false,
    modelError: null as string | null,
    saveError: null as string | null,
    settingsError: false,
    modelWait: null as Promise<void> | null,
    saveWait: null as Promise<void> | null,
  };
  const writes: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method !== "POST") {
      reads.push(String(url));
      if (String(url).startsWith("/api/providers/models?")) {
        if (state.modelWait) await state.modelWait;
        return state.modelError
          ? Response.json({ message: state.modelError }, { status: 422 })
          : Response.json(catalog);
      }
      return state.settingsError
        ? Response.json({ message: "Offline" }, { status: 503 })
        : Response.json({
            connections: state.connections,
            defaultId: state.defaultId,
            cleanupPending: state.cleanupPending,
          });
    }
    const body = JSON.parse(String(options.body));
    writes.push(body);
    switch (body.action) {
      case "save": {
        if (state.saveWait) await state.saveWait;
        if (state.saveError)
          return Response.json({ message: state.saveError }, { status: 422 });
        const { apiKey, removeKey, ...values } = body.connection;
        const previous = state.connections.find(
          (value) => value.id === values.id,
        );
        const saved = {
          ...values,
          id: values.id ?? id,
          configured: !!apiKey || (!!previous?.configured && !removeKey),
          credentialError: null,
          revision: (previous?.revision ?? -1) + 1,
        };
        state.connections = [saved];
        return Response.json({ connection: saved, warning: null });
      }
      case "default":
        state.defaultId = body.id;
        return Response.json(null);
      case "delete":
        state.connections = state.connections.filter(
          (value) => value.id !== body.id,
        );
        return Response.json({ warning: null });
      default:
        throw new Error(`Unexpected legacy action: ${body.action}`);
    }
  });
  vi.stubGlobal("fetch", fetcher);
  const view = (element: ReactNode) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    clients.push(client);
    return render(
      <QueryClientProvider client={client}>
        <TooltipProvider>{element}</TooltipProvider>
      </QueryClientProvider>,
    );
  };
  return { state, reads, writes, fetcher, view };
};

test("provider headers contain compact error and refresh controls without discovery blocks or local endpoint details", async () => {
  const fixture = setup([connection()]);
  fixture.state.modelError =
    "Server unavailable or timed out. Start the server, retry, or enter its exact model ID.";
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  const status = await screen.findByRole("button", {
    name: "Ollama: model check failed",
  });
  const heading = screen.getByRole("heading", { name: /Ollama/, level: 3 });
  expect(heading.contains(status)).toBe(true);
  expect(
    within(heading).getByRole("button", { name: "Refresh Ollama models" }),
  ).toBeTruthy();
  expect(screen.queryByText("Model discovery")).toBeNull();
  expect(screen.queryByText("http://localhost:11434")).toBeNull();
  expect(screen.queryByText(/inference server on this computer/)).toBeNull();
  expect(screen.queryByText(fixture.state.modelError)).toBeNull();
  const user = userEvent.setup();
  await user.hover(status);
  expect(
    (await screen.findByText(fixture.state.modelError!)).textContent,
  ).toContain(fixture.state.modelError);
  fixture.state.modelError = null;
  await user.click(
    screen.getByRole("button", { name: "Refresh Ollama models" }),
  );
  await screen.findByRole("button", { name: "Ollama: models available" });
  expect(fixture.writes).toEqual([]);
});

test("refresh runs one model-list GET and stays disabled while that request is pending", async () => {
  const fixture = setup([connection()]);
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  await screen.findByRole("button", { name: "Ollama: models available" });
  let finish!: () => void;
  fixture.state.modelWait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const before = fixture.reads.filter((value) =>
    value.startsWith("/api/providers/models?"),
  ).length;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh Ollama models" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Refresh Ollama models",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Ollama: checking models" }),
  ).toBeTruthy();
  finish();
  await screen.findByRole("button", { name: "Ollama: models available" });
  expect(
    fixture.reads.filter((value) => value.startsWith("/api/providers/models?")),
  ).toHaveLength(before + 1);
});

test.each(["Enter", "blur"])(
  "secure save on %s refreshes model discovery and keeps failures in the header tooltip",
  async (trigger) => {
    const fixture = setup();
    fixture.state.modelError = "Provider rejected the API key.";
    fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("OpenRouter API key"),
      "invalid-key",
    );
    if (trigger === "Enter") await user.keyboard("{Enter}");
    else {
      await user.tab();
      await user.tab();
    }
    const status = await screen.findByRole("button", {
      name: "OpenRouter: model check failed",
    });
    expect(
      (screen.getByLabelText("OpenRouter API key") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retry connection check" }),
    ).toBeNull();
    await user.hover(status);
    expect(
      (await screen.findByText("Provider rejected the API key.")).textContent,
    ).toContain("rejected the API key");
    expect(fixture.writes.map((value) => value.action)).toEqual(["save"]);
    expect(
      fixture.reads.some((value) =>
        value.includes(`/api/providers/models?connectionId=${id}`),
      ),
    ).toBe(true);
    fixture.state.modelError = null;
    await user.click(
      screen.getByRole("button", { name: "Refresh OpenRouter models" }),
    );
    await screen.findByRole("button", { name: "OpenRouter: models available" });
  },
);

test("configuration save spins the header and a failed secure write retains the draft without checking models", async () => {
  const fixture = setup();
  fixture.state.saveError = "OS credential store locked. Retry.";
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  let finish!: () => void;
  fixture.state.saveWait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const user = userEvent.setup();
  const input = await screen.findByLabelText("OpenAI API key");
  await user.type(input, "private-draft{Enter}");
  await screen.findByRole("button", { name: "OpenAI: checking models" });
  expect(
    (
      screen.getByRole("button", {
        name: "Refresh OpenAI models",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  finish();
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(fixture.state.saveError),
  );
  expect((input as HTMLInputElement).value).toBe("private-draft");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    fixture.reads.filter((value) => value.startsWith("/api/providers/models?")),
  ).toEqual([]);
  expect(
    screen.getByRole("button", { name: "OpenAI: model check failed" }),
  ).toBeTruthy();
});

test("missing OS credentials are explained in the header instead of beneath the provider", async () => {
  const saved = {
    ...connection("openrouter"),
    credentialError: "Unlock the OS credential store.",
  };
  const fixture = setup([saved]);
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  const status = await screen.findByRole("button", {
    name: "OpenRouter: model check failed",
  });
  expect(screen.queryByText(saved.credentialError)).toBeNull();
  await userEvent.setup().hover(status);
  expect(
    (await screen.findByText(saved.credentialError)).textContent,
  ).toContain(saved.credentialError);
});

test("failed provider reads can retry and unconfigured providers perform no model requests", async () => {
  const fixture = setup();
  fixture.state.settingsError = true;
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  const retry = await screen.findByRole("button", { name: "Retry settings" });
  fixture.state.settingsError = false;
  await userEvent.setup().click(retry);
  await screen.findByRole("heading", { name: "Ollama" });
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(14);
  expect(screen.getAllByRole("button", { name: /^Sign In / })).toHaveLength(2);
  expect(
    fixture.reads.filter((value) => value.startsWith("/api/providers/models?")),
  ).toEqual([]);
});

test("local configure delegates navigation without endpoint summary or duplicate feedback state", async () => {
  const fixture = setup([connection()]);
  const configure = vi.fn();
  fixture.view(<ProviderSettings onConfigure={configure} />);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Configure Ollama" }));
  expect(configure).toHaveBeenCalledWith(
    "ollama",
    expect.objectContaining({ id }),
  );
});

test("reveal does not save; leaving the key input saves exactly once and clears its draft", async () => {
  const fixture = setup();
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  const user = userEvent.setup();
  const input = await screen.findByLabelText("OpenRouter API key");
  await user.type(input, "draft-key");
  await user.tab();
  await user.keyboard(" ");
  expect(input.getAttribute("type")).toBe("text");
  expect(fixture.writes).toEqual([]);
  await user.tab();
  await waitFor(() =>
    expect(
      (screen.getByLabelText("OpenRouter API key") as HTMLInputElement).value,
    ).toBe(""),
  );
  expect(fixture.writes).toHaveLength(1);
});

test("local configuration keeps inputs and refreshes the GET catalog after saving without a legacy POST check", async () => {
  const fixture = setup();
  fixture.view(<ConnectionForm provider="ollama" />);
  expect(
    (screen.getByLabelText("API base URL") as HTMLInputElement).value,
  ).toBe("http://localhost:11434");
  expect(screen.queryByText(/inference server on this computer/)).toBeNull();
  expect(screen.queryByLabelText(/model/i)).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save connection" }));
  await screen.findByRole("button", { name: "Ollama: models available" });
  expect(fixture.writes.map((value) => value.action)).toEqual(["save"]);
  expect(screen.queryByText("Model discovery")).toBeNull();
});

test("local optional key removal remains effective after the initial save", async () => {
  const fixture = setup();
  fixture.view(<ConnectionForm provider="ollama" />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("API key"), "optional-key{Enter}");
  await user.click(await screen.findByLabelText("Remove saved API key"));
  const endpoint = screen.getByLabelText("API base URL");
  await user.clear(endpoint);
  await user.type(endpoint, "http://localhost:11435");
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  await waitFor(() => expect(fixture.writes).toHaveLength(2));
  expect(fixture.writes[1]).toMatchObject({
    action: "save",
    connection: { id, removeKey: true, baseURL: "http://localhost:11435" },
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Remove saved API key")).toBeNull(),
  );
});

test("deleting a connection still requires confirmation and cancel preserves it", async () => {
  const fixture = setup([connection()]);
  fixture.view(<ProviderSettings onConfigure={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Delete Ollama connection" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fixture.writes).toEqual([]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Add provider opens a Compatible APIs group and routes OpenAI to configuration", async () => {
  const fixture = setup();
  const onConfigure = vi.fn();
  fixture.view(<ProviderSettings onConfigure={onConfigure} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add provider" }));
  const menu = within(await screen.findByRole("menu"));
  expect(menu.getByText("Compatible APIs")).toBeTruthy();
  await user.click(menu.getByRole("menuitem", { name: "OpenAI" }));
  expect(onConfigure).toHaveBeenCalledWith("openai-compatible", undefined);
});

test("saved custom providers display their own name and offer configuration", async () => {
  const saved = {
    ...connection("openrouter"),
    provider: "openai-compatible" as const,
    name: "My custom server",
    models: [
      {
        id: "model",
        contextWindow: 32000,
        maxOutputTokens: 4096,
        maxCompletionTokens: 32000,
        supportsTools: true,
        supportsImages: false,
        supportsParallelToolCalls: false,
        supportsPromptCacheKey: false,
        supportsChatCompletions: true,
        usesMaxTokens: false,
        supportsThinking: false,
      },
    ],
  };
  const fixture = setup([saved]);
  const onConfigure = vi.fn();
  fixture.view(<ProviderSettings onConfigure={onConfigure} />);
  expect(
    await screen.findByRole("heading", { name: /My custom server/ }),
  ).toBeTruthy();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Configure My custom server" }));
  expect(onConfigure).toHaveBeenCalledWith("openai-compatible", saved);
});
