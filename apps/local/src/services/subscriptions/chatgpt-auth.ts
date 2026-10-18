import * as oauth from "oauth4webapi";
import { z } from "zod";
import {
  chatGptCredentialsSchema,
  type ChatGptCredentialsSchema,
} from "./schemas";
import { ChatGptSignInError, type ChatGptSignInStage } from "./errors";

const server: oauth.AuthorizationServer = {
  issuer: "https://auth.openai.com",
  authorization_endpoint: "https://auth.openai.com/api/accounts/authorize",
  token_endpoint: "https://auth.openai.com/api/accounts/oauth/token",
  jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
};
const planScope = "chatgpt.tokens.use.direct";

export type ChatGptAuthorization = {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  expiresAt: number;
  clientId?: string;
};

export const createChatGptAuthorization = async (
  origin: string,
  hostId: string,
  clientId?: string,
) => {
  const callback = new URL("/auth/callback", origin);
  if (callback.protocol !== "http:" || callback.hostname !== "127.0.0.1")
    throw new Error("ChatGPT sign-in requires the local workspace URL.");
  const attempt: ChatGptAuthorization = {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    verifier: oauth.generateRandomCodeVerifier(),
    redirectUri: callback.href,
    expiresAt: Date.now() + 10 * 60 * 1000,
    clientId,
  };
  const url = new URL(server.authorization_endpoint!);
  url.search = new URLSearchParams({
    client_id: clientId ?? "dynamic_agent_client",
    ...(clientId ? {} : { agent_name_hint: "Senslop" }),
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope:
      "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
    resource: "https://api.openai.com/v1",
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: "S256",
    code_challenge: await oauth.calculatePKCECodeChallenge(attempt.verifier),
  }).toString();
  return { url: url.href, attempt };
};

const httpOptions = (fetcher: typeof fetch) => ({
  [oauth.customFetch]: ((input, init) =>
    fetcher(input, {
      ...init,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(15000),
    })) satisfies typeof fetch,
});

const accountFromClaims = (claims: oauth.IDToken) => {
  const auth = z
    .looseObject({ chatgpt_plan_type: z.string().optional() })
    .safeParse(claims["https://api.openai.com/auth"]);
  return {
    email: z.email().parse(claims.email),
    subject: claims.sub,
    plan: auth.success ? (auth.data.chatgpt_plan_type ?? null) : null,
  };
};

export const exchangeChatGptAuthorization = async (
  attempt: ChatGptAuthorization,
  callback: URL,
  fetcher: typeof fetch = fetch,
  onRegistration?: (clientId: string) => void | Promise<void>,
): Promise<ChatGptCredentialsSchema> => {
  let stage: ChatGptSignInStage = "callback-validation";
  try {
    if (
      attempt.expiresAt < Date.now() ||
      callback.origin + callback.pathname !== attempt.redirectUri ||
      callback.searchParams.get("state") !== attempt.state
    )
      throw new Error(
        "This sign-in request expired or did not match. Sign in again.",
      );
    if (callback.searchParams.has("error")) {
      if (callback.searchParams.get("error") === "access_denied")
        stage = "plan-permission";
      throw new Error(
        "ChatGPT sign-in was canceled. Sign in again when ready.",
      );
    }
    const returnedClientId = callback.searchParams.get("client_id");
    const clientId = attempt.clientId ?? returnedClientId;
    if (
      !clientId ||
      clientId === "dynamic_agent_client" ||
      clientId.length > 500 ||
      (attempt.clientId &&
        returnedClientId !== null &&
        returnedClientId !== attempt.clientId)
    )
      throw new Error("ChatGPT registration did not complete. Sign in again.");
    const client: oauth.Client = { client_id: clientId };
    const parameters = oauth.validateAuthResponse(
      server,
      client,
      callback.searchParams,
      attempt.state,
    );
    await onRegistration?.(clientId);
    stage = "token-exchange";
    const response = await oauth.authorizationCodeGrantRequest(
      server,
      client,
      oauth.None(),
      parameters,
      attempt.redirectUri,
      attempt.verifier,
      {
        ...httpOptions(fetcher),
        additionalParameters: new URLSearchParams({
          resource: "https://api.openai.com/v1",
        }),
      },
    );
    stage = response.status === 200 ? "identity-validation" : "token-exchange";
    const result = await oauth.processAuthorizationCodeResponse(
      server,
      client,
      response,
      { expectedNonce: attempt.nonce, requireIdToken: true },
    );
    await oauth.validateApplicationLevelSignature(
      server,
      response,
      httpOptions(fetcher),
    );
    const claims = oauth.getValidatedIdTokenClaims(result)!;
    stage = "plan-permission";
    const scopes = (result.scope ?? "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(planScope))
      throw new Error(
        "ChatGPT plan permission was not granted. Sign in and enable plan usage.",
      );
    stage = "credential-validation";
    return chatGptCredentialsSchema.parse({
      clientId,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      idToken: result.id_token,
      expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
      scopes,
      account: accountFromClaims(claims),
    });
  } catch (error) {
    if (error instanceof ChatGptSignInError) throw error;
    throw new ChatGptSignInError(stage, error);
  }
};

export const refreshChatGptCredentials = async (
  previous: ChatGptCredentialsSchema,
  fetcher: typeof fetch = fetch,
): Promise<ChatGptCredentialsSchema> => {
  const client: oauth.Client = { client_id: previous.clientId };
  const response = await oauth.refreshTokenGrantRequest(
    server,
    client,
    oauth.None(),
    previous.refreshToken,
    {
      ...httpOptions(fetcher),
      additionalParameters: new URLSearchParams({
        resource: "https://api.openai.com/v1",
      }),
    },
  );
  const result = await oauth.processRefreshTokenResponse(
    server,
    client,
    response,
  );
  const scopes = result.scope
    ? result.scope.split(" ").filter(Boolean)
    : previous.scopes;
  if (!scopes.includes(planScope))
    throw new Error("ChatGPT plan permission expired. Sign in again.");
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (claims) {
    await oauth.validateApplicationLevelSignature(
      server,
      response,
      httpOptions(fetcher),
    );
    if (claims.sub !== previous.account.subject)
      throw new Error("ChatGPT account changed. Sign in again.");
  }
  return chatGptCredentialsSchema.parse({
    ...previous,
    accessToken: result.access_token,
    refreshToken: result.refresh_token ?? previous.refreshToken,
    idToken: result.id_token ?? previous.idToken,
    scopes,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
    account: claims ? accountFromClaims(claims) : previous.account,
  });
};
