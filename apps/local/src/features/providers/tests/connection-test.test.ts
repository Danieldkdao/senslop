import { expect, test, vi } from "vitest";
import { probeConnection } from "../lib/probe-connection";

const connection = {
  provider: "chatgpt" as const,
  name: "Test",
  baseURL: "https://api.openai.com/v1",
  model: "manual",
  contextWindow: null,
};
test("connection tests request metadata only, credentials stay in headers, redirects are refused", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model-one" }] })),
    );
  const result = await probeConnection(
    connection,
    "test-key",
    "models",
    fetcher,
  );
  expect(result.models).toEqual(["model-one"]);
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.openai.com/v1/models",
    expect.objectContaining({
      method: "GET",
      redirect: "error",
      headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
    }),
  );
  expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("body");
  expect(JSON.stringify(result)).not.toContain("test-key");
});
test("Google, Anthropic and Ollama use their native model-list formats", async () => {
  for (const [provider, payload, expected, baseURL] of [
    [
      "google",
      { models: [{ name: "models/gemini-test" }] },
      "gemini-test",
      "https://generativelanguage.googleapis.com/v1beta",
    ],
    [
      "anthropic",
      { data: [{ id: "claude-test" }] },
      "claude-test",
      "https://api.anthropic.com/v1",
    ],
    [
      "ollama",
      { models: [{ name: "local-test" }] },
      "local-test",
      "http://localhost:11434",
    ],
  ] as const) {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    expect(
      (
        await probeConnection(
          { ...connection, provider, baseURL },
          "key",
          "models",
          fetcher,
        )
      ).models,
    ).toEqual([expected]);
    const call = fetcher.mock.calls[0]!;
    expect(call[0]).not.toContain("key=");
    if (provider === "google")
      expect(call[1].headers).toMatchObject({ "x-goog-api-key": "key" });
    if (provider === "anthropic")
      expect(call[1].headers).toMatchObject({
        "x-api-key": "key",
        "anthropic-version": "2023-06-01",
      });
    if (provider === "ollama") expect(call[0]).toContain("/api/tags");
  }
});
test("public catalogs do not falsely verify keys, invalid credentials and unsupported discovery are explicit", async () => {
  const publicCatalog = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "model" }] })),
    );
  const gateway = await probeConnection(
    {
      ...connection,
      provider: "vercel",
      baseURL: "https://ai-gateway.vercel.sh/v1",
    },
    "secret",
    "test",
    publicCatalog,
  );
  expect(gateway.message).toMatch(/not verified/i);
  const invalid = vi
    .fn()
    .mockResolvedValue(new Response("provider echoed secret", { status: 401 }));
  await expect(
    probeConnection(connection, "secret", "test", invalid),
  ).rejects.toThrow(/credentials/i);
  const unsupported = await probeConnection(
    connection,
    "secret",
    "models",
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  expect(unsupported).toMatchObject({ models: [], supported: false });
  expect(unsupported.message).toMatch(/not been verified/i);
  await expect(
    probeConnection(
      connection,
      "secret",
      "test",
      vi.fn().mockRejectedValue(new Error("connect secret")),
    ),
  ).rejects.toThrow(/unavailable/i);
});
test("invalid and oversized metadata never echo secrets, and model names cannot return the submitted key", async () => {
  for (const body of [
    "provider echoed private-key",
    "x".repeat(4 * 1024 * 1024 + 1),
  ]) {
    await expect(
      probeConnection(
        connection,
        "private-key",
        "models",
        vi.fn().mockResolvedValue(new Response(body)),
      ),
    ).rejects.toThrow("Provider returned invalid or oversized metadata");
  }
  const catalog = await probeConnection(
    connection,
    "private-key",
    "models",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "private-key" }, { id: "safe-model" }],
        }),
      ),
    ),
  );
  expect(catalog.models).toEqual(["safe-model"]);
  expect(JSON.stringify(catalog)).not.toContain("private-key");
});
