import { beforeEach, expect, test, vi } from "vitest";
import type { WorkspaceClient } from "../src/features/workspace/workspace-client.js";
import { executeSettingsCommand } from "../src/features/settings/commands.js";
import { executeProviderCommand } from "../src/features/providers/commands.js";
import { parseCliCommand } from "../src/features/commands/parse-command.js";
import { readTextInput } from "../src/features/commands/input.js";

vi.mock("../src/features/commands/input.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/features/commands/input.js")
  >()),
  readTextInput: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(readTextInput).mockReset();
});

const fixture = () => {
  const request = vi.fn().mockResolvedValue({
    connections: [],
    defaultId: null,
    connection: { id: "saved" },
  });
  return { request, client: { request } as unknown as WorkspaceClient };
};

test("settings write a minimal nested patch and reject unsafe object paths", async () => {
  const { request, client } = fixture();
  await executeSettingsCommand(
    client,
    parseCliCommand([
      "settings",
      "set",
      "roles.grouping",
      '{"connectionId":"id","modelId":"fixture","name":"Fixture"}',
    ]),
  );
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/api/agents/settings",
    {
      roles: {
        grouping: { connectionId: "id", modelId: "fixture", name: "Fixture" },
      },
    },
    "PATCH",
  );
  await expect(
    executeSettingsCommand(
      client,
      parseCliCommand(["settings", "set", "__proto__.polluted", "true"]),
    ),
  ).rejects.toThrow(/key/i);
});

test("provider commands reuse presets and save through the existing credential service API", async () => {
  const { request, client } = fixture();
  await executeProviderCommand(
    client,
    parseCliCommand(["providers", "save", "--provider", "ollama"]),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/providers",
    expect.objectContaining({
      action: "save",
      connection: expect.objectContaining({
        provider: "ollama",
        baseURL: "http://localhost:11434",
        apiKey: "",
      }),
    }),
  );
  expect(request).toHaveBeenLastCalledWith(
    "/api/providers",
    expect.objectContaining({ action: "test" }),
  );
});

test.each(["key", "endpoint"])(
  "compatible provider %s updates preserve saved models",
  async (change) => {
    const { request, client } = fixture();
    const models = [
      {
        id: "custom/model",
        contextWindow: 16384,
        maxCompletionTokens: 4096,
        maxOutputTokens: 2048,
        supportsTools: true,
        supportsImages: false,
        supportsParallelToolCalls: false,
        supportsPromptCacheKey: false,
        supportsChatCompletions: true,
        usesMaxTokens: false,
        supportsThinking: false,
      },
    ];
    const existing = {
      id: crypto.randomUUID(),
      provider: "openai-compatible",
      name: "Private server",
      baseURL: "https://original.example.test/v1",
      model: "custom/model",
      contextWindow: 16384,
      models,
      configured: true,
      revision: 1,
    };
    request.mockResolvedValueOnce({ connections: [existing] });
    vi.mocked(readTextInput).mockResolvedValue("rotated-test-key\n");
    await executeProviderCommand(
      client,
      parseCliCommand([
        "providers",
        "save",
        "--id",
        existing.id,
        ...(change === "key"
          ? ["--key-stdin"]
          : ["--endpoint", "https://replacement.example.test/v1"]),
      ]),
    );
    expect(request).toHaveBeenCalledWith("/api/providers", {
      action: "save",
      connection: expect.objectContaining({
        id: existing.id,
        name: existing.name,
        model: existing.model,
        models,
        baseURL:
          change === "key"
            ? existing.baseURL
            : "https://replacement.example.test/v1",
        apiKey: change === "key" ? "rotated-test-key" : "",
      }),
    });
    expect(request).toHaveBeenCalledTimes(3);
    if (change === "key")
      expect(readTextInput).toHaveBeenCalledExactlyOnceWith("-");
    else expect(readTextInput).not.toHaveBeenCalled();
  },
);

test("new compatible providers require a JSON file before reading a replacement key", async () => {
  const { request, client } = fixture();
  vi.mocked(readTextInput).mockResolvedValue("test-key");
  await expect(
    executeProviderCommand(
      client,
      parseCliCommand([
        "providers",
        "save",
        "--provider",
        "openai-compatible",
        "--key-stdin",
        "--json",
      ]),
    ),
  ).rejects.toMatchObject({
    code: "invalid_arguments",
    exitCode: 2,
    message: expect.stringMatching(/--file.*model/i),
  });
  expect(readTextInput).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test("noninteractive destructive commands require explicit confirmation before making requests", async () => {
  const { request, client } = fixture();
  await expect(
    executeProviderCommand(
      client,
      parseCliCommand(["providers", "delete", "id", "--json"]),
    ),
  ).rejects.toThrow(/--yes/);
  expect(request).not.toHaveBeenCalled();
});

test("subscription sign-in bounds an unresponsive status request by --timeout", async () => {
  const { request, client } = fixture();
  request.mockResolvedValueOnce({
    id: "sign-in-flow",
    status: "pending",
    url: null,
    error: null,
  });
  request.mockImplementationOnce(
    async (_path, _body, _method, signal?: AbortSignal) => {
      if (!signal) throw new Error("Status request is missing its timeout");
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  );
  await expect(
    executeProviderCommand(
      client,
      parseCliCommand([
        "providers",
        "sign-in",
        "claude-code",
        "--wait",
        "--timeout",
        "1",
        "--json",
      ]),
    ),
  ).rejects.toMatchObject({
    exitCode: 5,
    code: "timeout",
    details: { requestId: "sign-in-flow" },
    message: expect.stringContaining("providers sign-in-status"),
  });
  expect(request).toHaveBeenCalledTimes(2);
});

test("subscription sign-in returns completed status before its deadline", async () => {
  const { request, client } = fixture();
  const completed = {
    id: "sign-in-flow",
    status: "complete",
    url: null,
    error: null,
  };
  request.mockResolvedValueOnce({ ...completed, status: "pending" });
  request.mockResolvedValueOnce(completed);
  await expect(
    executeProviderCommand(
      client,
      parseCliCommand([
        "providers",
        "sign-in",
        "chatgpt-subscription",
        "--wait",
        "--timeout",
        "2",
        "--json",
      ]),
    ),
  ).resolves.toEqual(completed);
});

test("subscription sign-in preserves status request errors before its deadline", async () => {
  const { request, client } = fixture();
  request.mockResolvedValueOnce({
    id: "sign-in-flow",
    status: "pending",
    url: null,
    error: null,
  });
  request.mockRejectedValueOnce(new Error("Local app disconnected"));
  await expect(
    executeProviderCommand(
      client,
      parseCliCommand([
        "providers",
        "sign-in",
        "claude-code",
        "--wait",
        "--timeout",
        "2",
        "--json",
      ]),
    ),
  ).rejects.toThrow("Local app disconnected");
});
