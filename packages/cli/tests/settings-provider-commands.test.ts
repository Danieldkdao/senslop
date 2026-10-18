import { expect, test, vi } from "vitest";
import type { WorkspaceClient } from "../src/features/workspace/workspace-client.js";
import { executeSettingsCommand } from "../src/features/settings/commands.js";
import { executeProviderCommand } from "../src/features/providers/commands.js";
import { parseCliCommand } from "../src/features/commands/parse-command.js";

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
