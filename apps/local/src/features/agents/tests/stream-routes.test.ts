import { expect, test, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { POST as chat } from "../../../app/api/agents/chat/route";
import { POST as explain } from "../../../app/api/agents/explain/route";

const state = vi.hoisted(() => ({ allowed: false }));
vi.mock("server-only", () => ({}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  protectLocalRoute: () => state.allowed,
  readLocalBody: (request: Request) => request.json(),
  getWorkspace: () => {
    throw new Error("Must reject before accessing the workspace.");
  },
}));
vi.mock("../../../services/credentials/os-credentials", () => ({
  osCredentials: {},
}));

test.each([
  { name: "chat", route: chat },
  { name: "explain", route: explain },
])(
  "$name authorization errors are readable by native SDK clients",
  async ({ route }) => {
    state.allowed = false;
    const client = new Chat({
      transport: new DefaultChatTransport({
        fetch: async (_url, options) =>
          route(new Request("http://localhost/api/agents/chat", options)),
      }),
    });
    await client.sendMessage({ text: "Explain" });
    expect(client.status).toBe("error");
    expect(client.error?.message).toBe("Invalid local session.");
  },
);

test("invalid chat input returns a plain SDK transport error before accessing stored state", async () => {
  state.allowed = true;
  const response = await chat(
    new Request("http://localhost/api/agents/chat", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.text()).toBe(
    "Choose a model and enter a bounded message.",
  );
});
