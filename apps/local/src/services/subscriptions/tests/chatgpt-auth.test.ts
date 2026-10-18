import { generateKeyPairSync, sign } from "node:crypto";
import { expect, test, vi } from "vitest";
import {
  createChatGptAuthorization,
  exchangeChatGptAuthorization,
  refreshChatGptCredentials,
} from "../chatgpt-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
};
const token = (nonce: string, clientId = "oaiapp_fixture") => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const value = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({ iss: "https://auth.openai.com", aud: clientId, sub: "user-1", email: "reviewer@example.com", nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, "https://api.openai.com/auth": { chatgpt_plan_type: "free" } })}`;
  return `${value}.${sign("RSA-SHA256", Buffer.from(value), privateKey).toString("base64url")}`;
};

test("ChatGPT login uses distinct PKCE, validates the issued client and signed identity, and retains subscription scopes", async () => {
  const { url, attempt } = await createChatGptAuthorization(
    "http://127.0.0.1:9876",
    "urn:uuid:host",
  );
  const authorization = new URL(url);
  expect(authorization.searchParams.get("client_id")).toBe(
    "dynamic_agent_client",
  );
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorization.searchParams.get("scope")).toContain(
    "chatgpt.tokens.use.direct",
  );
  const callback = new URL("http://127.0.0.1:9876/auth/callback");
  callback.search = new URLSearchParams({
    state: attempt.state,
    code: "private-code",
    client_id: "oaiapp_fixture",
  }).toString();
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("jwks")) return Response.json({ keys: [jwk] });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("client_id")).toBe("oaiapp_fixture");
    expect(body.get("code_verifier")).toBe(attempt.verifier);
    expect(init?.redirect).toBe("manual");
    return Response.json({
      access_token: "private-access",
      refresh_token: "private-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope:
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      id_token: token(attempt.nonce),
    });
  };
  const result = await exchangeChatGptAuthorization(attempt, callback, fetcher);
  expect(result.account).toEqual({
    email: "reviewer@example.com",
    subject: "user-1",
    plan: "free",
  });
  expect(result.clientId).toBe("oaiapp_fixture");
  expect(result.accessToken).toBe("private-access");
});

test("wrong state and declined authorization never exchange a code", async () => {
  const { attempt } = await createChatGptAuthorization(
    "http://127.0.0.1:9876",
    "urn:uuid:host",
  );
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({});
  };
  await expect(
    exchangeChatGptAuthorization(
      attempt,
      new URL(
        "http://127.0.0.1:9876/auth/callback?state=wrong&code=bad&client_id=oaiapp_fixture",
      ),
      fetcher,
    ),
  ).rejects.toThrow();
  await expect(
    exchangeChatGptAuthorization(
      attempt,
      new URL(
        `http://127.0.0.1:9876/auth/callback?state=${attempt.state}&error=access_denied`,
      ),
      fetcher,
    ),
  ).rejects.toMatchObject({
    stage: "plan-permission",
    message: expect.stringMatching(
      /ChatGPT plan access.*ChatGPT Plus.*ChatGPT Pro.*eligible account and workspace/,
    ),
  });
  expect(calls).toBe(0);
});

test("reauthorization retains the issued client and accepts its callback without a client_id", async () => {
  const { url, attempt } = await createChatGptAuthorization(
    "http://127.0.0.1:9876",
    "urn:uuid:host",
    "oaiapp_fixture",
  );
  expect(new URL(url).searchParams.get("client_id")).toBe("oaiapp_fixture");
  expect(new URL(url).searchParams.has("agent_name_hint")).toBe(false);
  const callback = new URL(attempt.redirectUri);
  callback.search = new URLSearchParams({
    state: attempt.state,
    code: "fresh-code",
  }).toString();
  const registered = vi.fn();
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("jwks")) return Response.json({ keys: [jwk] });
    expect(registered).toHaveBeenCalledWith("oaiapp_fixture");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("client_id")).toBe("oaiapp_fixture");
    expect(body.get("redirect_uri")).toBe(attempt.redirectUri);
    expect(body.get("resource")).toBe("https://api.openai.com/v1");
    expect(body.get("code_verifier")).toBe(attempt.verifier);
    expect(body.get("code")).toBe("fresh-code");
    return Response.json({
      access_token: "private-access",
      refresh_token: "private-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "chatgpt.tokens.use.direct",
      id_token: token(attempt.nonce),
    });
  };
  await expect(
    exchangeChatGptAuthorization(attempt, callback, fetcher, registered),
  ).resolves.toMatchObject({ clientId: "oaiapp_fixture" });
});

test("reauthorization rejects a substituted client before registration or code exchange", async () => {
  const { attempt } = await createChatGptAuthorization(
    "http://127.0.0.1:9876",
    "urn:uuid:host",
    "oaiapp_fixture",
  );
  const callback = new URL(attempt.redirectUri);
  callback.search = new URLSearchParams({
    state: attempt.state,
    code: "private-code",
    client_id: "oaiapp_other",
  }).toString();
  const registered = vi.fn();
  const fetcher = vi.fn(async () => Response.json({}));
  await expect(
    exchangeChatGptAuthorization(attempt, callback, fetcher, registered),
  ).rejects.toMatchObject({ stage: "callback-validation" });
  expect(registered).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

test.each(["nonce", "audience", "signature"])(
  "ChatGPT rejects an invalid ID token %s before saving its identity",
  async (invalid) => {
    const { attempt } = await createChatGptAuthorization(
      "http://127.0.0.1:9876",
      "urn:uuid:host",
    );
    const callback = new URL(attempt.redirectUri);
    callback.search = new URLSearchParams({
      state: attempt.state,
      code: "private-code",
      client_id: "oaiapp_fixture",
    }).toString();
    let idToken = token(
      invalid === "nonce" ? "wrong" : attempt.nonce,
      invalid === "audience" ? "other-client" : "oaiapp_fixture",
    );
    if (invalid === "signature") {
      const segments = idToken.split(".");
      segments[2] = Buffer.alloc(256).toString("base64url");
      idToken = segments.join(".");
    }
    const fetcher: typeof fetch = async (input) =>
      String(input).includes("jwks")
        ? Response.json({ keys: [jwk] })
        : Response.json({
            access_token: "private-access",
            refresh_token: "private-refresh",
            token_type: "Bearer",
            expires_in: 3600,
            scope:
              "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            id_token: idToken,
          });
    await expect(
      exchangeChatGptAuthorization(attempt, callback, fetcher),
    ).rejects.toThrow();
  },
);

test("refresh rotates credentials and cannot silently remove plan permission", async () => {
  const previous = {
    clientId: "oaiapp_fixture",
    accessToken: "old",
    refreshToken: "old-refresh",
    expiresAt: 0,
    idToken: "previous-id",
    scopes: ["chatgpt.tokens.use.direct"],
    account: { email: "reviewer@example.com", subject: "user-1", plan: "plus" },
  };
  const refreshed = await refreshChatGptCredentials(previous, async () =>
    Response.json({
      access_token: "new",
      refresh_token: "new-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "chatgpt.tokens.use.direct",
    }),
  );
  expect(refreshed).toMatchObject({
    accessToken: "new",
    refreshToken: "new-refresh",
    account: previous.account,
  });
  await expect(
    refreshChatGptCredentials(previous, async () =>
      Response.json({
        access_token: "new",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid email",
      }),
    ),
  ).rejects.toThrow(/permission/i);
});

test.each(["token-exchange", "identity-validation", "plan-permission"])(
  "ChatGPT distinguishes %s failure after browser approval",
  async (stage) => {
    const { attempt } = await createChatGptAuthorization(
      "http://127.0.0.1:9876",
      "urn:uuid:host",
    );
    const callback = new URL(attempt.redirectUri);
    callback.search = new URLSearchParams({
      state: attempt.state,
      code: "private-code",
      client_id: "oaiapp_fixture",
    }).toString();
    const fetcher: typeof fetch = async (input) => {
      if (String(input).includes("jwks")) return Response.json({ keys: [jwk] });
      if (stage === "token-exchange")
        return Response.json(
          {
            error: "invalid_grant",
            error_description: "private-provider-detail",
          },
          { status: 400 },
        );
      return Response.json({
        access_token: "private-access",
        refresh_token: "private-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope:
          stage === "plan-permission"
            ? "openid email"
            : "chatgpt.tokens.use.direct",
        id_token: token(
          stage === "identity-validation" ? "wrong" : attempt.nonce,
        ),
      });
    };
    const failure = await exchangeChatGptAuthorization(
      attempt,
      callback,
      fetcher,
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ stage });
    expect((failure as Error).message).not.toMatch(/private-/);
    if (stage !== "plan-permission")
      expect((failure as Error).message).not.toMatch(
        /enable plan|allow ChatGPT plan|not granted/,
      );
    if (stage === "token-exchange")
      expect((failure as Error).message).toMatch(
        /rejected.*authorization code/i,
      );
  },
);
