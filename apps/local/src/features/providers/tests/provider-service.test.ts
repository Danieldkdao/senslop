import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { ProviderService } from "../lib/provider-service";
import type { CredentialStore } from "../../../services/credentials/types";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-providers-"));
  directories.push(directory);
  const path = join(directory, "reviews.sqlite");
  const store = new LocalStore(path);
  const keys = new Map<string, string>();
  const credentials: CredentialStore = {
    get: vi.fn(async (id) => keys.get(id) ?? null),
    set: vi.fn(async (id, key) => {
      keys.set(id, key);
    }),
    delete: vi.fn(async (id) => {
      keys.delete(id);
    }),
  };
  return {
    path,
    store,
    keys,
    credentials,
    service: new ProviderService(store, credentials),
  };
};
const input = {
  provider: "chatgpt" as const,
  name: "My OpenAI",
  baseURL: "https://api.openai.com/v1",
  model: "manual-model",
  contextWindow: null,
  apiKey: "unique-test-secret",
};

const compatibleModel = {
  id: "local/model",
  maxCompletionTokens: 200000,
  maxOutputTokens: 32000,
  contextWindow: 200000,
  supportsTools: true,
  supportsImages: false,
  supportsParallelToolCalls: false,
  supportsPromptCacheKey: false,
  supportsChatCompletions: true,
  usesMaxTokens: false,
  supportsThinking: false,
};

test("custom compatible providers persist model capabilities while keeping their key out of SQLite", async () => {
  const { path, store, service, credentials } = await fixture();
  try {
    const saved = await service.save({
      ...input,
      provider: "openai-compatible",
      name: "My compatible server",
      models: [compatibleModel],
    });
    expect(saved.connection.models).toEqual([compatibleModel]);
    expect(JSON.stringify(saved)).not.toContain(input.apiKey);
    const reopened = new LocalStore(path);
    try {
      expect(
        (await new ProviderService(reopened, credentials).list()).connections[0]
          ?.models,
      ).toEqual([compatibleModel]);
    } finally {
      reopened.close();
    }
    expect((await readFile(path)).includes(Buffer.from(input.apiKey))).toBe(
      false,
    );
  } finally {
    store.close();
  }
});

test("custom providers reject duplicate names and invalid model budgets before saving a key", async () => {
  const { store, service, credentials } = await fixture();
  try {
    const config = {
      ...input,
      provider: "openai-compatible",
      name: "Custom server",
      models: [compatibleModel],
    };
    await service.save(config);
    vi.mocked(credentials.set).mockClear();
    for (const invalid of [
      { ...config, name: "CUSTOM SERVER" },
      { ...config, name: "Another", models: [] },
      {
        ...config,
        name: "Another",
        models: [compatibleModel, compatibleModel],
      },
      {
        ...config,
        name: "Another",
        models: [{ ...compatibleModel, maxOutputTokens: 0 }],
      },
      {
        ...config,
        name: "Another",
        models: [{ ...compatibleModel, contextWindow: 1000 }],
      },
      {
        ...config,
        name: "Another",
        models: [{ ...compatibleModel, supportsTools: "yes" }],
      },
      {
        ...config,
        name: "Another",
        baseURL: "https://user:password@api.test/v1",
      },
    ])
      await expect(service.save(invalid)).rejects.toThrow();
    expect(credentials.set).not.toHaveBeenCalled();
    expect((await service.list()).connections).toHaveLength(1);
  } finally {
    store.close();
  }
});
test("only nonsecrets enter SQLite, credentials rotate through the OS abstraction, and defaults persist", async () => {
  const { path, store, service, keys, credentials } = await fixture();
  try {
    const saved = await service.save(input);
    expect(saved.connection.configured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(input.apiKey);
    expect(keys.size).toBe(1);
    await service.setDefault(saved.connection.id);
    const edited = await service.save({
      ...input,
      id: saved.connection.id,
      apiKey: "replacement-secret",
    });
    expect(edited.connection.id).toBe(saved.connection.id);
    expect(keys.size).toBe(1);
    expect(await service.list()).toMatchObject({
      defaultId: saved.connection.id,
      connections: [
        { name: "My OpenAI", model: "manual-model", configured: true },
      ],
    });
    expect(credentials.get).toHaveBeenCalled();
    const restarted = new LocalStore(path);
    try {
      expect(
        (await new ProviderService(restarted, credentials).list()).defaultId,
      ).toBe(saved.connection.id);
    } finally {
      restarted.close();
    }
    await service.delete(saved.connection.id);
    expect(keys.size).toBe(0);
    expect(await service.list()).toEqual({
      connections: [],
      defaultId: null,
      cleanupPending: false,
    });
  } finally {
    store.close();
  }
  const bytes = await readFile(path);
  expect(bytes.includes(Buffer.from(input.apiKey))).toBe(false);
  expect(bytes.includes(Buffer.from("replacement-secret"))).toBe(false);
});
test("credential-store failure prevents saving and editing endpoints requires a new credential or explicit removal", async () => {
  const { store, service, credentials } = await fixture();
  try {
    vi.mocked(credentials.set).mockRejectedValueOnce(
      new Error("locked unique-test-secret"),
    );
    await expect(service.save(input)).rejects.toThrow(/credential store/i);
    expect((await service.list()).connections).toEqual([]);
    const saved = await service.save(input);
    await expect(
      service.save({
        ...input,
        id: saved.connection.id,
        baseURL: "https://different.example/v1",
        apiKey: "",
      }),
    ).rejects.toThrow(/new key|endpoint/i);
    await expect(
      service.save({ ...input, provider: "unknown" } as never),
    ).rejects.toThrow();
    await expect(
      service.save({
        ...input,
        baseURL: "https://user:password@example.com/?key=secret",
      }),
    ).rejects.toThrow();
    await expect(
      service.save({ ...input, baseURL: "http://remote.example/v1" }),
    ).rejects.toThrow();
  } finally {
    store.close();
  }
});
test("optional local keys, context options, and failed credential deletion remain recoverable", async () => {
  const { store, service, credentials, keys } = await fixture();
  try {
    const local = await service.save({
      provider: "ollama",
      name: "Local",
      baseURL: "http://localhost:11434",
      model: "local-model",
      contextWindow: 8192,
      apiKey: "",
    });
    expect(local.connection).toMatchObject({
      configured: false,
      contextWindow: 8192,
    });
    const saved = await service.save(input);
    vi.mocked(credentials.delete).mockRejectedValueOnce(new Error("locked"));
    const deleted = await service.delete(saved.connection.id);
    expect(deleted.warning).toMatch(/credential store/i);
    expect((await service.list()).cleanupPending).toBe(true);
    await service.cleanup();
    expect(keys.size).toBe(0);
    expect((await service.list()).cleanupPending).toBe(false);
  } finally {
    store.close();
  }
});
test("a failed credential readback keeps failed cleanup recoverable without saving configuration", async () => {
  const { store, service, credentials, keys } = await fixture();
  try {
    vi.mocked(credentials.get).mockRejectedValueOnce(new Error("locked"));
    vi.mocked(credentials.delete).mockRejectedValueOnce(new Error("locked"));
    await expect(service.save(input)).rejects.toThrow(/credential store/i);
    expect(await service.list()).toMatchObject({
      connections: [],
      cleanupPending: true,
    });
    expect(keys.size).toBe(1);
    await service.cleanup();
    expect(keys.size).toBe(0);
    expect((await service.list()).cleanupPending).toBe(false);
  } finally {
    store.close();
  }
});

test("inference resolution reads current credentials and refuses missing keys or deleted connections", async () => {
  const { store, service, keys } = await fixture();
  try {
    const saved = await service.save(input);
    expect((await service.resolve(saved.connection.id)).secret).toBe(
      input.apiKey,
    );
    await service.save({
      ...input,
      id: saved.connection.id,
      apiKey: "rotated-key",
    });
    expect((await service.resolve(saved.connection.id)).secret).toBe(
      "rotated-key",
    );
    keys.clear();
    await expect(service.resolve(saved.connection.id)).rejects.toThrow(
      "missing",
    );
    await service.delete(saved.connection.id);
    await expect(service.resolve(saved.connection.id)).rejects.toThrow(
      "not found",
    );
  } finally {
    store.close();
  }
});

test("a saved keyless local connection resolves without credentials", async () => {
  const { store, service } = await fixture();
  try {
    const saved = await service.save({
      ...input,
      provider: "llama-cpp",
      apiKey: "",
      baseURL: "http://localhost:8080/v1",
    });
    expect((await service.resolve(saved.connection.id)).secret).toBeNull();
  } finally {
    store.close();
  }
});
