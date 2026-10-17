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
