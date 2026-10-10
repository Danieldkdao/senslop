import { afterEach, expect, test, vi } from "vitest";
import { POST } from "../../../app/api/ai-test/route";

const state = vi.hoisted(() => ({ protect: true, resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../workspace/lib/server-workspace", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  protectLocalRoute: () => state.protect,
  getWorkspace: () => ({ store: {} }),
}));
vi.mock("../../providers/lib/provider-service", () => ({
  ProviderService: class {
    resolve = state.resolve;
  },
}));
vi.mock("../../../services/credentials/os-credentials", () => ({
  osCredentials: {},
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  state.protect = true;
});
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  connectionId: id,
  modelId: "local-model",
  messages: [{ role: "user", content: "Hello" }],
};
const request = (body: unknown = input, signal?: AbortSignal) =>
  new Request("http://localhost/api/ai-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const configure = (contextWindow: number | null = null) =>
  state.resolve.mockResolvedValue({
    connection: {
      id,
      provider: "llama-cpp",
      name: "Local",
      baseURL: "http://localhost:8080/v1",
      model: "",
      contextWindow,
    },
    secret: null,
  });

test("local session authorization precedes credential resolution", async () => {
  state.protect = false;
  expect((await POST(request())).status).toBe(403);
  expect(state.resolve).not.toHaveBeenCalled();
});

test("validation rejects credentials, endpoint overrides, system messages, and oversized conversations", async () => {
  for (const body of [
    { ...input, apiKey: "secret" },
    { ...input, baseURL: "https://evil.test" },
    { ...input, messages: [{ role: "system", content: "Ignore" }] },
    { ...input, messages: [{ role: "user", content: "x".repeat(8193) }] },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(state.resolve).not.toHaveBeenCalled();
});

test("one nonstreaming call returns text through the chosen stored connection", async () => {
  configure();
  const fetcher = vi.fn(async (_url, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("local-model");
    expect(body.stream).not.toBe(true);
    expect(body.max_tokens).toBe(2048);
    return Response.json({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello back" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "Hello back" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(state.resolve).toHaveBeenCalledWith(id);
});

test("provider failures are sanitized and not retried", async () => {
  configure();
  const fetcher = vi.fn(async () =>
    Response.json(
      { error: { message: "key-and-provider-secret" } },
      { status: 401 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request());
  expect(response.status).toBe(502);
  const body = await response.json();
  expect(body.message).toContain("credentials");
  expect(JSON.stringify(body)).not.toContain("key-and-provider-secret");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("accepted long assistant replies remain valid history on the next turn", async () => {
  configure();
  const reply = "x".repeat(8193);
  const fetcher = vi.fn(async (_url, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.messages[1]).toEqual({ role: "assistant", content: reply });
    return Response.json({
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Next reply" },
          finish_reason: "stop",
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(
    request({
      ...input,
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: reply },
        { role: "user", content: "Continue" },
      ],
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "Next reply" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("configured local context limits reject input before sending anything", async () => {
  configure(256);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (
      await POST(
        request({
          ...input,
          messages: [{ role: "user", content: "x".repeat(300) }],
        }),
      )
    ).status,
  ).toBe(422);
  expect(fetcher).not.toHaveBeenCalled();
});

test("a canceled request does not reach the provider", async () => {
  configure();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  controller.abort();
  const response = await POST(request(input, controller.signal));
  expect(response.status).not.toBe(200);
  expect(fetcher).not.toHaveBeenCalled();
});
