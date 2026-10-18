import { randomUUID } from "node:crypto";
import {
  isSubscriptionProvider,
  type SubscriptionProvider,
} from "@senslop/contracts";
import type { LocalStore } from "@senslop/review-core/storage";
import { ProviderService } from "../../features/providers/lib/provider-service";
import { formatSubscriptionRequirements } from "../../features/providers/lib/formatters";
import type { CredentialStore } from "../credentials/types";
import type { SubscriptionSignInSchema } from "../../features/providers/subscription-schemas";
import type { ModelCatalogSchema } from "../../features/providers/model-schemas";
import { chatGptCredentialsSchema } from "./schemas";
import {
  createChatGptAuthorization,
  exchangeChatGptAuthorization,
  refreshChatGptCredentials,
  type ChatGptAuthorization,
} from "./chatgpt-auth";
import { createClaudeSubscriptionDriver } from "./claude-auth";
import { discoverChatGptModels } from "./subscription-models";
import {
  ChatGptSignInError,
  getChatGptSignInDiagnostics,
  type ChatGptSignInStage,
} from "./errors";

type SignInFlow = {
  public: SubscriptionSignInSchema;
  abort: AbortController;
  authorization?: ChatGptAuthorization;
  timer: ReturnType<typeof setTimeout>;
  expiresAt: number;
  grantRetried?: boolean;
};

export class SubscriptionService {
  private flows = new Map<string, SignInFlow>();
  private refreshes = new Map<string, Promise<string>>();
  private catalogs = new Map<
    string,
    { expiresAt: number; catalog: ModelCatalogSchema }
  >();
  private providers: ProviderService;
  private fetcher: typeof fetch;
  private claude: ReturnType<typeof createClaudeSubscriptionDriver>;

  constructor(
    private store: LocalStore,
    private credentials: CredentialStore,
    options: {
      fetcher?: typeof fetch;
      claude?: ReturnType<typeof createClaudeSubscriptionDriver>;
    } = {},
  ) {
    this.providers = new ProviderService(store, credentials);
    this.fetcher = options.fetcher ?? fetch;
    this.claude = options.claude ?? createClaudeSubscriptionDriver();
  }

  private chatGptHostId = () => {
    this.store.database
      .prepare(
        "INSERT OR IGNORE INTO preferences VALUES ('subscription_host_id', ?)",
      )
      .run(`urn:uuid:${randomUUID()}`);
    return String(
      this.store.database
        .prepare(
          "SELECT value FROM preferences WHERE name = 'subscription_host_id'",
        )
        .get()!.value,
    );
  };

  start = async (
    provider: SubscriptionProvider,
    origin: string,
  ): Promise<SubscriptionSignInSchema> => {
    for (const [id, flow] of this.flows) {
      if (flow.expiresAt < Date.now()) {
        this.cancel(id);
        this.flows.delete(id);
      } else if (
        flow.public.provider === provider &&
        flow.public.status === "pending"
      )
        return { ...flow.public };
    }
    const id = randomUUID();
    const flow: SignInFlow = {
      public: { id, provider, status: "pending", url: null, error: null },
      abort: new AbortController(),
      expiresAt: Date.now() + 600000,
      timer: setTimeout(() => this.cancel(id), 600000),
    };
    flow.timer.unref?.();
    this.flows.set(id, flow);
    let stage = "sign-in";
    try {
      if (provider === "chatgpt-subscription") {
        stage = "host-storage";
        const hostId = this.chatGptHostId();
        const registration = this.store.database
          .prepare(
            "SELECT value FROM preferences WHERE name = 'chatgpt_pending_client_id'",
          )
          .get();
        stage = "authorization-url";
        const authorization = await createChatGptAuthorization(
          origin,
          hostId,
          registration ? String(registration.value) : undefined,
        );
        flow.authorization = authorization.attempt;
        flow.public.url = authorization.url;
      } else {
        void this.claude
          .signIn(flow.abort.signal)
          .then(async (account) => {
            if (flow.abort.signal.aborted) return;
            const saved = await this.providers.saveSubscription(
              provider,
              account,
              JSON.stringify({ subscription: true }),
              undefined,
              flow.abort.signal,
            );
            if (flow.abort.signal.aborted) {
              await this.providers.delete(saved.connection.id);
              return;
            }
            flow.public.status = "complete";
            clearTimeout(flow.timer);
          })
          .catch(() =>
            this.fail(
              flow,
              `Claude Code sign-in did not complete. ${formatSubscriptionRequirements("claude-code")} Check your account's Claude Code access and retry sign-in.`,
            ),
          );
      }
    } catch {
      console.warn("[senslop:subscription-auth]", {
        event: "start-failed",
        provider,
        stage,
      });
      this.fail(
        flow,
        stage === "host-storage"
          ? "Could not save ChatGPT sign-in settings locally. Check that the workspace data directory is writable, then retry."
          : "Could not prepare sign-in. Restart Senslop from its CLI and retry.",
      );
    }
    return { ...flow.public };
  };

  private fail = (flow: SignInFlow, message: string) => {
    if (flow.public.status !== "pending") return;
    flow.public.status = "failed";
    flow.public.error = message;
    clearTimeout(flow.timer);
    flow.abort.abort();
  };

  status = (id: string): SubscriptionSignInSchema => {
    const flow = this.flows.get(id);
    if (!flow)
      throw new Error("Sign-in request not found. Start sign-in again.");
    return { ...flow.public };
  };

  cancel = (id: string) => {
    const flow = this.flows.get(id);
    if (!flow || flow.public.status !== "pending") return;
    flow.public.status = "canceled";
    flow.authorization = undefined;
    clearTimeout(flow.timer);
    flow.abort.abort();
  };

  completeChatGpt = async (
    callback: URL,
  ): Promise<SubscriptionSignInSchema> => {
    const flow = [...this.flows.values()].find(
      (flow) =>
        flow.authorization?.state === callback.searchParams.get("state"),
    );
    if (
      !flow ||
      !flow.authorization ||
      flow.public.status !== "pending" ||
      flow.abort.signal.aborted
    )
      throw new Error(
        "Sign-in request expired or did not match. Start again in Senslop.",
      );
    const authorization = flow.authorization;
    flow.authorization = undefined;
    let stage: ChatGptSignInStage = "token-exchange";
    let issuedClientId: string | undefined;
    try {
      const credentials = await exchangeChatGptAuthorization(
        authorization,
        callback,
        this.fetcher,
        (clientId) => {
          try {
            flow.abort.signal.throwIfAborted();
            this.store.database
              .prepare(
                "INSERT INTO preferences VALUES ('chatgpt_pending_client_id', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
              )
              .run(clientId);
            issuedClientId = clientId;
          } catch (error) {
            throw new ChatGptSignInError("registration-storage", error);
          }
        },
      );
      flow.abort.signal.throwIfAborted();
      stage = "credential-storage";
      const saved = await this.providers.saveSubscription(
        "chatgpt-subscription",
        credentials.account,
        JSON.stringify(credentials),
        undefined,
        flow.abort.signal,
      );
      if (flow.abort.signal.aborted) {
        await this.providers.delete(saved.connection.id);
        throw new Error("Sign-in canceled.");
      }
      flow.public.status = "complete";
      flow.public.url = null;
      clearTimeout(flow.timer);
      try {
        this.store.database
          .prepare(
            "DELETE FROM preferences WHERE name = 'chatgpt_pending_client_id' AND value = ?",
          )
          .run(credentials.clientId);
      } catch {
        console.warn("[senslop:subscription-auth]", {
          event: "registration-cleanup-failed",
          provider: "chatgpt-subscription",
        });
      }
      return { ...flow.public };
    } catch (error) {
      if (flow.abort.signal.aborted)
        throw new Error("ChatGPT sign-in was canceled.");
      const failure =
        error instanceof ChatGptSignInError
          ? error
          : new ChatGptSignInError(stage, error);
      const diagnostics = getChatGptSignInDiagnostics(failure);
      if (
        diagnostics.providerError === "invalid_grant" &&
        issuedClientId &&
        !flow.grantRetried &&
        flow.expiresAt > Date.now()
      ) {
        flow.grantRetried = true;
        try {
          const next = await createChatGptAuthorization(
            new URL(authorization.redirectUri).origin,
            this.chatGptHostId(),
            issuedClientId,
          );
          flow.abort.signal.throwIfAborted();
          flow.authorization = next.attempt;
          flow.public.url = next.url;
          console.info("[senslop:subscription-auth]", {
            event: "grant-retry-started",
            provider: "chatgpt-subscription",
            ...diagnostics,
          });
          return { ...flow.public };
        } catch {
          if (flow.abort.signal.aborted)
            throw new Error("ChatGPT sign-in was canceled.");
        }
      }
      console.warn("[senslop:subscription-auth]", {
        event: "callback-failed",
        provider: "chatgpt-subscription",
        ...diagnostics,
      });
      this.fail(flow, failure.message);
      throw failure;
    }
  };

  resolve = async (id: string) => {
    const resolved = await this.providers.resolve(id);
    if (!isSubscriptionProvider(resolved.connection.provider))
      throw new Error("Choose a subscription connection.");
    if (resolved.connection.provider === "claude-code") {
      const account = await this.claude.account(AbortSignal.timeout(15000));
      if (account.email !== resolved.connection.account?.email)
        throw new Error(
          "Claude Code account changed. Sign out in Senslop and sign in again.",
        );
      return resolved;
    }
    const credentials = chatGptCredentialsSchema.parse(
      JSON.parse(resolved.secret ?? "null"),
    );
    if (credentials.expiresAt > Date.now() + 60000)
      return { ...resolved, secret: credentials.accessToken };
    let refresh = this.refreshes.get(id);
    if (!refresh) {
      refresh = (async () => {
        try {
          const refreshed = await refreshChatGptCredentials(
            credentials,
            this.fetcher,
          );
          await this.providers.saveSubscription(
            "chatgpt-subscription",
            refreshed.account,
            JSON.stringify(refreshed),
            id,
          );
          this.catalogs.delete(id);
          return refreshed.accessToken;
        } catch {
          throw new Error("ChatGPT authorization expired. Sign in again.");
        }
      })();
      this.refreshes.set(id, refresh);
      void refresh.finally(() => this.refreshes.delete(id)).catch(() => {});
    }
    return { ...resolved, secret: await refresh };
  };

  models = async (
    id: string,
    signal: AbortSignal = AbortSignal.timeout(20000),
  ): Promise<ModelCatalogSchema> => {
    const resolved = await this.resolve(id);
    const cached = this.catalogs.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.catalog;
    const catalog: ModelCatalogSchema =
      resolved.connection.provider === "chatgpt-subscription"
        ? await discoverChatGptModels(resolved.secret!, signal, this.fetcher)
        : {
            models: await this.claude.models(signal),
            source: "live",
            manualAllowed: false,
            message: null,
          };
    this.catalogs.set(id, { expiresAt: Date.now() + 30000, catalog });
    return catalog;
  };

  signOut = async (id: string) => {
    const connection = (await this.providers.list()).connections.find(
      (connection) => connection.id === id,
    );
    if (!connection) throw new Error("Connection not found.");
    if (!isSubscriptionProvider(connection.provider))
      throw new Error("Choose a subscription connection.");
    for (const [flowId, flow] of this.flows)
      if (flow.public.provider === connection.provider) this.cancel(flowId);
    this.catalogs.delete(id);
    return this.providers.delete(id);
  };
}
