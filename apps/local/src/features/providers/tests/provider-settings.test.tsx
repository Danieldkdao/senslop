// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ProviderSettings } from "../components/provider-settings";
import { ConnectionForm } from "../components/connection-form";
import type { PublicConnectionSchema } from "@senslop/contracts";

vi.mock("../../../components/provider-icon", () => ({
  ProviderIcon: () => <span />,
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const empty = { connections: [], defaultId: null, cleanupPending: false };

test("a newly saved local connection exposes key removal and retains its saved state", async () => {
  const connection: PublicConnectionSchema = {
    id: "00000000-0000-4000-8000-000000000004",
    provider: "ollama",
    name: "Ollama",
    baseURL: "http://localhost:11434",
    model: "",
    contextWindow: null,
    configured: true,
    credentialError: null,
  };
  const calls: { action: string; connection?: { removeKey?: boolean } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      return {
        ok: true,
        json: async () =>
          body.action === "save"
            ? {
                connection: {
                  ...connection,
                  configured: !body.connection.removeKey,
                },
                warning: null,
              }
            : { supported: true, models: [], message: "Metadata received." },
      };
    }),
  );
  const user = userEvent.setup();
  render(<ConnectionForm provider="ollama" onSaved={vi.fn()} />);
  await user.type(screen.getByLabelText("API key"), "optional-key");
  await user.keyboard("{Enter}");
  await user.click(await screen.findByLabelText("Remove saved API key"));
  const endpoint = screen.getByLabelText("API base URL");
  await user.clear(endpoint);
  await user.type(endpoint, "http://localhost:11435");
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  await waitFor(() => expect(calls).toHaveLength(4));
  expect(calls[2]).toMatchObject({
    action: "save",
    connection: {
      id: connection.id,
      apiKey: "",
      removeKey: true,
      baseURL: "http://localhost:11435",
    },
  });
  expect(screen.queryByLabelText("Remove saved API key")).toBeNull();
});

test("failed provider reads show a retry action instead of staying in loading", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  const user = userEvent.setup();
  render(<ProviderSettings onConfigure={vi.fn()} />);
  const retry = await screen.findByRole("button", { name: "Retry settings" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => empty }),
  );
  await user.click(retry);
  await screen.findByRole("heading", { name: "Ollama" });
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each(["Enter", "blur"])(
  "failed check remains visible after the saved connection reloads on %s",
  async (trigger) => {
    const connection: PublicConnectionSchema = {
      id: "00000000-0000-4000-8000-000000000001",
      provider: "openrouter",
      name: "OpenRouter",
      baseURL: "https://openrouter.ai/api/v1",
      model: "",
      contextWindow: null,
      configured: true,
      credentialError: null,
    };
    let saved = false;
    let valid = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        if (!options?.body)
          return {
            ok: true,
            json: async () => ({
              ...empty,
              connections: saved ? [connection] : [],
            }),
          };
        const body = JSON.parse(String(options.body));
        if (body.action === "save") {
          saved = true;
          return { ok: true, json: async () => ({ connection }) };
        }
        if (body.action === "default")
          return { ok: true, json: async () => null };
        if (valid)
          return {
            ok: true,
            json: async () => ({
              supported: true,
              models: [],
              message: "Connection metadata received.",
            }),
          };
        return {
          ok: false,
          json: async () => ({ message: "Provider rejected the API key." }),
        };
      }),
    );
    const user = userEvent.setup();
    render(<ProviderSettings onConfigure={vi.fn()} />);
    await user.type(
      await screen.findByLabelText("OpenRouter API key"),
      "invalid-key",
    );
    if (trigger === "Enter") await user.keyboard("{Enter}");
    else {
      await user.tab();
      await user.tab();
    }
    // Wait for the parent to render the real saved record, not transient feedback.
    await screen.findByRole("button", { name: "Use by default OpenRouter" });
    expect(screen.getByRole("alert").textContent).toMatch(
      /connection check failed.*rejected the API key/i,
    );
    expect(
      (screen.getByLabelText("OpenRouter API key") as HTMLInputElement).value,
    ).toBe("");
    await user.click(
      screen.getByRole("button", { name: "Use by default OpenRouter" }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /rejected the API key/,
    );
    valid = true;
    await user.click(
      screen.getByRole("button", { name: "Retry connection check" }),
    );
    await screen.findByRole("status");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/metadata received/);
  },
);
test("exactly twelve providers, remote keys save on Enter without a name or model, local configure delegates navigation", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "POST"
          ? {
              connection: { id: "00000000-0000-4000-8000-000000000002" },
              warning: null,
              supported: true,
              models: [],
              message: "Connection metadata received.",
            }
          : empty,
    }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const configure = vi.fn();
  render(<ProviderSettings onConfigure={configure} />);
  expect(await screen.findByRole("heading", { name: "Ollama" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(12);
  expect(screen.getAllByRole("button", { name: /^Configure / })).toHaveLength(
    3,
  );
  expect(screen.queryByText(/Copilot/)).toBeNull();
  await user.type(
    screen.getByLabelText("OpenRouter API key"),
    "test-key{Enter}",
  );
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/providers",
      expect.objectContaining({ body: expect.stringContaining('"model":""') }),
    ),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("OpenRouter API key") as HTMLInputElement).value,
    ).toBe(""),
  );
  await user.click(screen.getByRole("button", { name: "Configure Ollama" }));
  expect(configure).toHaveBeenCalledWith(
    "ollama",
    undefined,
    expect.any(Function),
    expect.objectContaining({
      initialFeedback: null,
      onFeedback: expect.any(Function),
    }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("blur saves once, failed secure storage retains draft, and saved keys are never returned to an input", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url, options?: RequestInit) =>
      options?.method === "POST"
        ? {
            ok: false,
            json: async () => ({
              message: "OS credential store locked. Retry.",
            }),
          }
        : { ok: true, json: async () => empty },
    );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<ProviderSettings onConfigure={vi.fn()} />);
  const input = await screen.findByLabelText("ChatGPT API key");
  await user.type(input, "new-test-key");
  await user.tab();
  await user.tab();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("credential store locked"),
  );
  expect((input as HTMLInputElement).value).toBe("new-test-key");
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});
test("local configuration uses endpoint preset without model controls or a provider-name field", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      connection: { id: "00000000-0000-4000-8000-000000000002" },
      warning: null,
      supported: true,
      models: [],
      message: "Connection metadata received.",
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ConnectionForm provider="ollama" onSaved={saved} />);
  expect(
    (screen.getByLabelText("API base URL") as HTMLInputElement).value,
  ).toBe("http://localhost:11434");
  expect(screen.queryByLabelText(/name/i)).toBeNull();
  expect(screen.queryByLabelText(/model/i)).toBeNull();
  expect(screen.queryByRole("button", { name: "Load models" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save connection" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
});

test("dedicated password inputs reveal drafts without saving, then clear after secure save", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === "POST"
          ? {
              connection: { id: "00000000-0000-4000-8000-000000000002" },
              warning: null,
              supported: true,
              models: [],
              message: "Connection metadata received.",
            }
          : empty,
    }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const { unmount } = render(<ProviderSettings onConfigure={vi.fn()} />);
  const input = await screen.findByLabelText("OpenRouter API key");
  await user.type(input, "draft-key");
  await user.tab();
  await user.keyboard(" ");
  expect(input.getAttribute("type")).toBe("text");
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  await user.tab();
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(2);
  unmount();
  render(<ConnectionForm provider="ollama" onSaved={vi.fn()} />);
  const localKey = screen.getByLabelText("API key");
  await user.type(localKey, "local-draft");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(localKey.getAttribute("type")).toBe("text");
  expect(screen.queryByLabelText(/model/i)).toBeNull();
});

test("key submission saves securely before automatic check; failed checks preserve configured state and allow replacement", async () => {
  const calls: object[] = [];
  const fetcher = vi.fn(async (_url, options?: RequestInit) => {
    if (!options?.body) return { ok: true, json: async () => empty };
    const body = JSON.parse(String(options.body));
    calls.push(body);
    if (body.action === "save")
      return {
        ok: true,
        json: async () => ({
          connection: { id: "00000000-0000-4000-8000-000000000001" },
          warning: null,
        }),
      };
    return {
      ok: false,
      json: async () => ({
        message:
          "Provider rejected the credentials. Check your API key and endpoint.",
      }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<ProviderSettings onConfigure={vi.fn()} />);
  const input = await screen.findByLabelText("OpenRouter API key");
  await user.type(input, "invalid-key{Enter}");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/saved securely.*connection check failed/i);
  expect(alert.classList.contains("text-destructive")).toBe(true);
  expect(calls).toMatchObject([
    { action: "save" },
    { action: "test", id: "00000000-0000-4000-8000-000000000001" },
  ]);
  expect(calls[1]).not.toHaveProperty("connection");
  expect((input as HTMLInputElement).value).toBe("");
  await user.click(
    screen.getByRole("button", { name: "Retry connection check" }),
  );
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2]).toEqual({
    action: "test",
    id: "00000000-0000-4000-8000-000000000001",
  });
  await user.type(input, "replacement-key{Enter}");
  await waitFor(() => expect(calls).toHaveLength(5));
  expect(calls[3]).toMatchObject({
    action: "save",
    connection: {
      id: "00000000-0000-4000-8000-000000000001",
      apiKey: "replacement-key",
    },
  });
});

test("local key blur checks the newly saved endpoint, preserves the configuration screen, and colors failed feedback only", async () => {
  const calls: object[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      return {
        ok: true,
        json: async () =>
          body.action === "save"
            ? {
                connection: { id: "00000000-0000-4000-8000-000000000003" },
                warning: null,
              }
            : {
                supported: false,
                models: [],
                message: "Credentials have not been verified.",
              },
      };
    }),
  );
  const user = userEvent.setup();
  const saved = vi.fn().mockResolvedValue(undefined);
  render(<ConnectionForm provider="ollama" onSaved={saved} />);
  await user.type(screen.getByLabelText("API key"), "local-key");
  await user.tab();
  expect(calls).toHaveLength(0);
  await user.tab();
  const feedback = await screen.findByRole("alert");
  expect(feedback.textContent).toMatch(/not been verified/);
  expect(feedback.classList.contains("text-destructive")).toBe(true);
  expect(feedback.classList.contains("bg-muted")).toBe(true);
  expect(calls).toMatchObject([
    { action: "save" },
    { action: "test", id: "00000000-0000-4000-8000-000000000003" },
  ]);
  expect(saved).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("API base URL")).toBeTruthy();
});
