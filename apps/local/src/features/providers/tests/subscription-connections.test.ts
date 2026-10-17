import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { ProviderService } from "../lib/provider-service";
import { providerConfigSchema } from "@senslop/contracts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("subscription connections retain account metadata but keep tokens exclusively in the credential store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-subscription-"));
  directories.push(directory);
  const path = join(directory, "local.sqlite");
  const store = new LocalStore(path);
  const secrets = new Map<string, string>();
  const credentials = {
    get: vi.fn(async (id: string) => secrets.get(id) ?? null),
    set: vi.fn(async (id: string, value: string) => {
      secrets.set(id, value);
    }),
    delete: vi.fn(async (id: string) => {
      secrets.delete(id);
    }),
  };
  const service = new ProviderService(store, credentials);
  const secret = JSON.stringify({
    accessToken: "private-access",
    refreshToken: "private-refresh",
  });
  try {
    const saved = await service.saveSubscription(
      "chatgpt-subscription",
      {
        email: "reviewer@example.com",
        subject: "account-1",
        plan: "free",
      },
      secret,
    );
    expect(saved.connection).toMatchObject({
      configured: true,
      account: { email: "reviewer@example.com", plan: "free" },
    });
    expect(JSON.stringify(await service.list())).not.toContain(
      "private-access",
    );
    expect((await service.resolve(saved.connection.id)).secret).toBe(secret);
    await expect(
      service.save({
        ...providerConfigSchema.parse(saved.connection),
        apiKey: "arbitrary-token",
      }),
    ).rejects.toThrow(/sign in/i);
    await service.delete(saved.connection.id);
    expect(secrets.size).toBe(0);
  } finally {
    store.close();
  }
  expect((await readFile(path)).includes(Buffer.from("private-access"))).toBe(
    false,
  );
});

test("an unavailable credential store does not create a signed-in connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-subscription-"));
  directories.push(directory);
  const store = new LocalStore(join(directory, "local.sqlite"));
  const service = new ProviderService(store, {
    get: async () => null,
    set: async () => {
      throw new Error("locked private-token");
    },
    delete: async () => {},
  });
  try {
    await expect(
      service.saveSubscription(
        "claude-code",
        { email: "reviewer@example.com", subject: "account-1", plan: "max" },
        "private-token",
      ),
    ).rejects.toThrow(/credential store/i);
    expect((await service.list()).connections).toEqual([]);
  } finally {
    store.close();
  }
});
