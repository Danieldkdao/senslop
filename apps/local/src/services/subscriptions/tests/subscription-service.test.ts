import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "@senslop/review-core/storage";
import { SubscriptionService } from "../subscription-service";
import { ProviderService } from "../../../features/providers/lib/provider-service";
import * as chatGptAuth from "../chatgpt-auth";

const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of close.splice(0)) await cleanup();
  vi.restoreAllMocks();
});
const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-subscriptions-"));
  const store = new LocalStore(join(directory, "local.sqlite"));
  close.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const secrets = new Map<string, string>();
  const credentials = {
    get: async (id: string) => secrets.get(id) ?? null,
    set: async (id: string, value: string) => {
      secrets.set(id, value);
    },
    delete: async (id: string) => {
      secrets.delete(id);
    },
  };
  return {
    store,
    credentials,
    secrets,
    providers: new ProviderService(store, credentials),
  };
};

test("Claude sign-in transitions asynchronously and only saves a verified subscription account", async () => {
  const fixture = await setup();
  let finish!: (account: {
    email: string;
    subject: string;
    plan: string;
  }) => void;
  const account = {
    email: "reviewer@example.com",
    subject: "reviewer@example.com",
    plan: "max",
  };
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    claude: {
      signIn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      account: async () => account,
      models: async () => [
        { id: "sonnet", name: "Claude Sonnet", available: true },
      ],
    },
  });
  const flow = await service.start("claude-code", "http://127.0.0.1:9876");
  expect(service.status(flow.id).status).toBe("pending");
  finish(account);
  await vi.waitFor(() =>
    expect(service.status(flow.id).status).toBe("complete"),
  );
  const connection = (await fixture.providers.list()).connections[0]!;
  expect(connection.account?.email).toBe(account.email);
  expect(
    (await service.models(connection.id)).models.map((model) => model.id),
  ).toEqual(["sonnet"]);
  await service.signOut(connection.id);
  expect((await fixture.providers.list()).connections).toEqual([]);
  expect(fixture.secrets.size).toBe(0);
});

test("canceling sign-in prevents late results from reconnecting an account", async () => {
  const fixture = await setup();
  let finish!: (account: {
    email: string;
    subject: string;
    plan: string;
  }) => void;
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    claude: {
      signIn: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      account: async () => {
        throw new Error();
      },
      models: async () => [],
    },
  });
  const flow = await service.start("claude-code", "http://127.0.0.1:9876");
  service.cancel(flow.id);
  finish({ email: "reviewer@example.com", subject: "user", plan: "pro" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(service.status(flow.id).status).toBe("canceled");
  expect((await fixture.providers.list()).connections).toEqual([]);
});

test("canceling while the credential store is writing removes the credential and never saves a connection", async () => {
  const fixture = await setup();
  let finishWrite!: () => void;
  const originalSet = fixture.credentials.set;
  fixture.credentials.set = async (id, value) => {
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    await originalSet(id, value);
  };
  const account = {
    email: "reviewer@example.com",
    subject: "user",
    plan: "pro",
  };
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    claude: {
      signIn: async () => account,
      account: async () => account,
      models: async () => [],
    },
  });
  const flow = await service.start("claude-code", "http://127.0.0.1:9876");
  await vi.waitFor(() => expect(finishWrite).toBeTypeOf("function"));
  service.cancel(flow.id);
  finishWrite();
  await vi.waitFor(() => expect(fixture.secrets.size).toBe(0));
  expect(service.status(flow.id).status).toBe("canceled");
  expect((await fixture.providers.list()).connections).toEqual([]);
});

test("sign-out removes the connection even when its credential can no longer be read", async () => {
  const fixture = await setup();
  const saved = await fixture.providers.saveSubscription(
    "claude-code",
    { email: "reviewer@example.com", subject: "user", plan: "pro" },
    "private-marker",
  );
  fixture.credentials.get = async () => {
    throw new Error("Credential store locked");
  };
  const service = new SubscriptionService(fixture.store, fixture.credentials);
  await service.signOut(saved.connection.id);
  expect((await fixture.providers.list()).connections).toEqual([]);
  expect(fixture.secrets.size).toBe(0);
});

test("ChatGPT catalog honors account visibility and explicit access restrictions without curated fallback", async () => {
  const fixture = await setup();
  const account = {
    email: "free@example.com",
    subject: "free-user",
    plan: "free",
  };
  const saved = await fixture.providers.saveSubscription(
    "chatgpt-subscription",
    account,
    JSON.stringify({
      account,
      clientId: "oaiapp_fixture",
      accessToken: "private-access",
      refreshToken: "private-refresh",
      idToken: "id",
      scopes: ["chatgpt.tokens.use.direct"],
      expiresAt: Date.now() + 3600000,
    }),
  );
  const fetcher: typeof fetch = async (_url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer private-access",
    );
    return Response.json({
      models: [
        {
          slug: "free-model",
          display_name: "Available model",
          visibility: "list",
        },
        {
          slug: "paid-model",
          display_name: "Unavailable",
          visibility: "list",
          available: false,
        },
        { slug: "hidden", display_name: "Hidden", visibility: "hide" },
      ],
    });
  };
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    fetcher,
  });
  expect(
    (await service.models(saved.connection.id)).models.map((model) => model.id),
  ).toEqual(["free-model"]);
  expect((await service.models(saved.connection.id)).manualAllowed).toBe(false);
  const failed = new SubscriptionService(fixture.store, fixture.credentials, {
    fetcher: async () => Response.json({}, { status: 401 }),
  });
  await expect(failed.models(saved.connection.id)).rejects.toThrow(/sign in/i);
});

test.each(["network"])(
  "approved ChatGPT access followed by %s failure is not reported as denied plan permission",
  async (mode) => {
    const fixture = await setup();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = new SubscriptionService(
      fixture.store,
      fixture.credentials,
      {
        fetcher: async () => {
          if (mode === "network") throw new Error("private-network-detail");
          return Response.json(
            {
              error: "invalid_grant",
              error_description: "private-provider-detail",
            },
            { status: 400 },
          );
        },
      },
    );
    const flow = await service.start(
      "chatgpt-subscription",
      "http://127.0.0.1:9876",
    );
    const callback = new URL("http://127.0.0.1:9876/auth/callback");
    callback.search = new URLSearchParams({
      state: new URL(flow.url!).searchParams.get("state")!,
      code: "private-code",
      client_id: "oaiapp_fixture",
    }).toString();
    await expect(service.completeChatGpt(callback)).rejects.toThrow(
      /exchange/i,
    );
    expect(service.status(flow.id)).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/exchange/i),
    });
    expect(service.status(flow.id).error).not.toMatch(
      /allow ChatGPT plan|private-/,
    );
    expect(log).toHaveBeenCalledWith(
      "[senslop:subscription-auth]",
      expect.objectContaining({
        event: "callback-failed",
        stage: "token-exchange",
        ...(mode === "invalid_grant"
          ? { providerError: "invalid_grant", statusCode: 400 }
          : {}),
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private-|oaiapp_fixture/,
    );
    expect((await fixture.providers.list()).connections).toEqual([]);
  },
);

test("invalid_grant starts one fresh authorization, retains registration across restart, and never redeems the old code again", async () => {
  const fixture = await setup();
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const codes: string[] = [];
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    fetcher: async (_input, init) => {
      codes.push(new URLSearchParams(String(init?.body)).get("code")!);
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    },
  });
  const flow = await service.start(
    "chatgpt-subscription",
    "http://127.0.0.1:9876",
  );
  const original = new URL(flow.url!);
  const callback = new URL(original.searchParams.get("redirect_uri")!);
  callback.search = new URLSearchParams({
    state: original.searchParams.get("state")!,
    code: "rejected-code",
    client_id: "oaiapp_fixture",
  }).toString();
  const recovered = await service.completeChatGpt(callback);
  expect(recovered).toMatchObject({
    id: flow.id,
    status: "pending",
    error: null,
  });
  const next = new URL(recovered.url!);
  expect(next.searchParams.get("client_id")).toBe("oaiapp_fixture");
  for (const key of ["state", "nonce", "code_challenge"])
    expect(next.searchParams.get(key)).not.toBe(original.searchParams.get(key));
  expect(codes).toEqual(["rejected-code"]);
  await expect(service.completeChatGpt(callback)).rejects.toThrow(
    /expired|match/i,
  );
  expect(service.status(flow.id).status).toBe("pending");
  const secondCallback = new URL(callback.origin + callback.pathname);
  secondCallback.search = new URLSearchParams({
    state: next.searchParams.get("state")!,
    code: "fresh-code",
  }).toString();
  await expect(service.completeChatGpt(secondCallback)).rejects.toThrow(
    /authorization code/i,
  );
  expect(service.status(flow.id).status).toBe("failed");
  expect(codes).toEqual(["rejected-code", "fresh-code"]);
  const restarted = new SubscriptionService(fixture.store, fixture.credentials);
  const retry = await restarted.start(
    "chatgpt-subscription",
    "http://127.0.0.1:9876",
  );
  expect(new URL(retry.url!).searchParams.get("client_id")).toBe(
    "oaiapp_fixture",
  );
  expect((await fixture.providers.list()).connections).toEqual([]);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /rejected-code|fresh-code|oaiapp_fixture/,
  );
  restarted.cancel(retry.id);
});

test("a successful fresh authorization after invalid_grant becomes connected and clears the pending registration", async () => {
  const fixture = await setup();
  vi.spyOn(console, "info").mockImplementation(() => {});
  const service = new SubscriptionService(fixture.store, fixture.credentials, {
    fetcher: async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
  });
  const flow = await service.start(
    "chatgpt-subscription",
    "http://127.0.0.1:9876",
  );
  const callback = new URL("http://127.0.0.1:9876/auth/callback");
  callback.search = new URLSearchParams({
    state: new URL(flow.url!).searchParams.get("state")!,
    code: "old-code",
    client_id: "oaiapp_fixture",
  }).toString();
  const next = await service.completeChatGpt(callback);
  const exchange = vi
    .spyOn(chatGptAuth, "exchangeChatGptAuthorization")
    .mockResolvedValueOnce({
      clientId: "oaiapp_fixture",
      accessToken: "private-access",
      refreshToken: "private-refresh",
      idToken: "private-id",
      expiresAt: Date.now() + 3600000,
      scopes: ["chatgpt.tokens.use.direct"],
      account: {
        email: "reviewer@example.com",
        subject: "user-1",
        plan: "plus",
      },
    });
  callback.search = new URLSearchParams({
    state: new URL(next.url!).searchParams.get("state")!,
    code: "fresh-code",
  }).toString();
  await expect(service.completeChatGpt(callback)).resolves.toMatchObject({
    status: "complete",
    url: null,
  });
  expect(exchange.mock.calls[0][0]).toMatchObject({
    clientId: "oaiapp_fixture",
  });
  expect(service.status(flow.id).status).toBe("complete");
  const connections = (await fixture.providers.list()).connections;
  expect(connections).toHaveLength(1);
  expect(connections[0]).toMatchObject({
    configured: true,
    account: { email: "reviewer@example.com" },
  });
  expect(JSON.stringify(connections)).not.toMatch(/private-/);
  expect(
    fixture.store.database
      .prepare(
        "SELECT value FROM preferences WHERE name = 'chatgpt_pending_client_id'",
      )
      .get(),
  ).toBeUndefined();
});

test("approved ChatGPT access that cannot be saved reports local credential storage failure", async () => {
  const fixture = await setup();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(chatGptAuth, "exchangeChatGptAuthorization").mockResolvedValue({
    clientId: "oaiapp_fixture",
    accessToken: "private-access",
    refreshToken: "private-refresh",
    idToken: "private-id",
    expiresAt: Date.now() + 3600000,
    scopes: ["chatgpt.tokens.use.direct"],
    account: { email: "reviewer@example.com", subject: "user-1", plan: "plus" },
  });
  fixture.credentials.set = async () => {
    throw new Error("private-keychain-detail");
  };
  const service = new SubscriptionService(fixture.store, fixture.credentials);
  const flow = await service.start(
    "chatgpt-subscription",
    "http://127.0.0.1:9876",
  );
  const callback = new URL("http://127.0.0.1:9876/auth/callback");
  callback.searchParams.set(
    "state",
    new URL(flow.url!).searchParams.get("state")!,
  );
  await expect(service.completeChatGpt(callback)).rejects.toThrow(
    /save|credential store/i,
  );
  expect(service.status(flow.id).error).not.toMatch(
    /allow ChatGPT plan|private-/,
  );
  expect((await fixture.providers.list()).connections).toEqual([]);
  expect(fixture.secrets.size).toBe(0);
});
