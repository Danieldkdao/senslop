import { randomUUID } from "node:crypto";
import {
  providerConfigSchema,
  saveConnectionSchema,
  storedConnectionSchema,
  publicConnectionSchema,
  type StoredConnectionSchema,
  type SubscriptionProvider,
  type ProviderAccountSchema,
  isSubscriptionProvider,
} from "@senslop/contracts";
import type { LocalStore } from "@senslop/review-core/storage";
import type { CredentialStore } from "../../../services/credentials/types";
import { formatProvider } from "./formatters";
import { probeConnection } from "./probe-connection";

const credentialError = () =>
  new Error(
    "The OS credential store is unavailable or locked. Unlock macOS Keychain, Windows Credential Manager, or Linux Secret Service, then retry. No plaintext fallback is used.",
  );

export class ProviderService {
  constructor(
    private readonly store: LocalStore,
    private readonly credentials: CredentialStore,
  ) {}

  private stored = (id: string): StoredConnectionSchema | null => {
    const existingConnection = this.store.database
      .prepare("SELECT body FROM connections WHERE id = ?")
      .get(id);
    return existingConnection
      ? storedConnectionSchema.parse(
          JSON.parse(String(existingConnection.body)),
        )
      : null;
  };

  private publicConnection = async (connection: StoredConnectionSchema) => {
    let configured = false;
    let error: string | null = null;
    if (connection.credentialRef) {
      try {
        configured = !!(await this.credentials.get(connection.credentialRef));
      } catch {
        error = credentialError().message;
      }
      if (!configured && !error)
        error =
          "Saved key was not found in the OS credential store. Enter it again.";
    }
    return publicConnectionSchema.parse({
      ...providerConfigSchema.parse(connection),
      id: connection.id,
      configured,
      credentialError: error,
      ...(connection.account ? { account: connection.account } : {}),
      revision: connection.revision,
    });
  };

  list = async () => {
    const existingConnections = this.store.database
      .prepare("SELECT body FROM connections ORDER BY rowid")
      .all();
    const connections = await Promise.all(
      existingConnections.map((row) =>
        this.publicConnection(
          storedConnectionSchema.parse(JSON.parse(String(row.body))),
        ),
      ),
    );
    const preference = this.store.database
      .prepare(
        "SELECT value FROM preferences WHERE name = 'default_connection'",
      )
      .get();
    return {
      connections,
      defaultId: preference ? String(preference.value) : null,
      cleanupPending: !!this.store.database
        .prepare("SELECT 1 FROM credential_cleanup LIMIT 1")
        .get(),
    };
  };

  save = async (input: unknown) => {
    const values = saveConnectionSchema.parse(input);
    if (isSubscriptionProvider(values.provider))
      throw new Error("Sign in to connect this subscription provider.");
    const existingConnection = values.id ? this.stored(values.id) : null;
    if (values.id && !existingConnection)
      throw new Error("Connection not found. Refresh settings and retry.");
    const checkName = () => {
      const duplicate = this.store.database
        .prepare("SELECT body FROM connections WHERE id != ?")
        .all(values.id ?? "")
        .some((row) => {
          const connection = storedConnectionSchema.parse(
            JSON.parse(String(row.body)),
          );
          return (
            (values.provider === "openai-compatible" ||
              connection.provider === "openai-compatible") &&
            connection.name.trim().toLowerCase() === values.name.toLowerCase()
          );
        });
      if (duplicate)
        throw new Error(
          "This provider name is already in use. Choose a unique name.",
        );
    };
    checkName();
    if (
      !values.id &&
      Number(
        this.store.database
          .prepare("SELECT COUNT(*) AS count FROM connections")
          .get()?.count,
      ) >= 100
    )
      throw new Error(
        "Remove an unused connection before adding more than 100 connections.",
      );
    if (values.contextWindow && !formatProvider(values.provider).contextWindow)
      throw new Error(
        "This provider does not support a context-window override.",
      );
    if (values.apiKey && values.removeKey)
      throw new Error("Enter a key or remove the saved key, not both.");
    const changedEndpoint =
      existingConnection &&
      (values.baseURL.replace(/\/$/, "") !==
        existingConnection.baseURL.replace(/\/$/, "") ||
        values.provider !== existingConnection.provider);
    if (
      changedEndpoint &&
      existingConnection.credentialRef &&
      !values.apiKey &&
      !values.removeKey
    )
      throw new Error(
        "The endpoint or provider changed. Enter a new key or explicitly remove the saved key to avoid sending it to another server.",
      );
    const credentialRef = values.apiKey
      ? randomUUID()
      : values.removeKey
        ? null
        : (existingConnection?.credentialRef ?? null);
    if (formatProvider(values.provider).keyRequired && !credentialRef)
      throw new Error("This provider requires an API key.");
    if (values.apiKey) {
      try {
        await this.credentials.set(credentialRef!, values.apiKey);
        if ((await this.credentials.get(credentialRef!)) !== values.apiKey)
          throw new Error("Key was not stored.");
      } catch {
        await this.credentials.delete(credentialRef!).catch(() => {
          this.queueCleanup(credentialRef!);
        });
        throw credentialError();
      }
    }
    const savedConnection = storedConnectionSchema.parse({
      ...providerConfigSchema.parse(values),
      id: existingConnection?.id ?? randomUUID(),
      credentialRef,
      revision: (existingConnection?.revision ?? -1) + 1,
    });
    try {
      this.store.transaction(() => {
        checkName();
        if (
          existingConnection &&
          this.stored(existingConnection.id)?.revision !==
            existingConnection.revision
        )
          throw new Error(
            "Connection was edited elsewhere. Refresh and retry.",
          );
        this.store.database
          .prepare(
            "INSERT INTO connections VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body",
          )
          .run(savedConnection.id, JSON.stringify(savedConnection));
        if (
          existingConnection?.credentialRef &&
          existingConnection.credentialRef !== credentialRef
        )
          this.queueCleanup(existingConnection.credentialRef);
      });
    } catch (error) {
      if (values.apiKey) {
        try {
          await this.credentials.delete(credentialRef!);
        } catch {
          this.queueCleanup(credentialRef!);
        }
      }
      throw error;
    }
    const warning = await this.cleanup();
    return {
      connection: await this.publicConnection(savedConnection),
      warning,
    };
  };

  saveSubscription = async (
    provider: SubscriptionProvider,
    account: ProviderAccountSchema,
    secret: string,
    id?: string,
    signal?: AbortSignal,
  ) => {
    const existingConnection = id ? this.stored(id) : null;
    if (id && (!existingConnection || existingConnection.provider !== provider))
      throw new Error("Connection not found. Refresh settings and retry.");
    if (
      !existingConnection &&
      Number(
        this.store.database
          .prepare("SELECT COUNT(*) AS count FROM connections")
          .get()?.count,
      ) >= 100
    )
      throw new Error(
        "Remove an unused connection before adding more than 100 connections.",
      );
    signal?.throwIfAborted();
    const credentialRef = randomUUID();
    const info = formatProvider(provider);
    const savedConnection = storedConnectionSchema.parse({
      provider,
      name: info.label,
      baseURL: info.baseURL,
      model: "",
      contextWindow: null,
      id: id ?? randomUUID(),
      credentialRef,
      revision: (existingConnection?.revision ?? -1) + 1,
      account,
    });
    try {
      await this.credentials.set(credentialRef, secret);
      if ((await this.credentials.get(credentialRef)) !== secret)
        throw credentialError();
      signal?.throwIfAborted();
    } catch {
      await this.credentials
        .delete(credentialRef)
        .catch(() => this.queueCleanup(credentialRef));
      throw credentialError();
    }
    try {
      this.store.transaction(() => {
        signal?.throwIfAborted();
        if (
          existingConnection &&
          this.stored(existingConnection.id)?.revision !==
            existingConnection.revision
        )
          throw new Error(
            "Connection was edited elsewhere. Refresh and retry.",
          );
        this.store.database
          .prepare(
            "INSERT INTO connections VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body",
          )
          .run(savedConnection.id, JSON.stringify(savedConnection));
        if (existingConnection?.credentialRef)
          this.queueCleanup(existingConnection.credentialRef);
      });
    } catch (error) {
      await this.credentials
        .delete(credentialRef)
        .catch(() => this.queueCleanup(credentialRef));
      throw error;
    }
    return {
      connection: await this.publicConnection(savedConnection),
      warning: await this.cleanup(),
    };
  };

  private queueCleanup = (id: string) => {
    this.store.database
      .prepare("INSERT OR IGNORE INTO credential_cleanup VALUES (?)")
      .run(id);
  };

  cleanup = async () => {
    const existingCredentials = this.store.database
      .prepare("SELECT id FROM credential_cleanup")
      .all();
    let failed = false;
    for (const row of existingCredentials) {
      try {
        await this.credentials.delete(String(row.id));
        this.store.database
          .prepare("DELETE FROM credential_cleanup WHERE id = ?")
          .run(row.id!);
      } catch {
        failed = true;
      }
    }
    return failed
      ? "Configuration saved, but old keys could not be removed from the OS credential store. Unlock it and retry credential cleanup."
      : null;
  };

  delete = async (id: string) => {
    this.store.transaction(() => {
      const existingConnection = this.stored(id);
      if (!existingConnection) throw new Error("Connection not found.");
      if (existingConnection.credentialRef)
        this.queueCleanup(existingConnection.credentialRef);
      this.store.database
        .prepare("DELETE FROM connections WHERE id = ?")
        .run(id);
      this.store.database
        .prepare(
          "DELETE FROM preferences WHERE name = 'default_connection' AND value = ?",
        )
        .run(id);
    });
    return { warning: await this.cleanup() };
  };

  setDefault = async (id: string | null) =>
    this.store.transaction(() => {
      if (id && !this.stored(id)) throw new Error("Connection not found.");
      if (id)
        this.store.database
          .prepare(
            "INSERT INTO preferences VALUES ('default_connection', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
          )
          .run(id);
      else
        this.store.database
          .prepare("DELETE FROM preferences WHERE name = 'default_connection'")
          .run();
    });

  resolve = async (id: string) => {
    const existingConnection = this.stored(id);
    if (!existingConnection)
      throw new Error("Connection not found. Refresh settings and retry.");
    let secret: string | null = null;
    if (existingConnection.credentialRef) {
      try {
        secret = await this.credentials.get(existingConnection.credentialRef);
      } catch {
        throw credentialError();
      }
      if (!secret) throw new Error("Saved API key is missing. Enter it again.");
    }
    if (formatProvider(existingConnection.provider).keyRequired && !secret)
      throw new Error("This provider requires an API key.");
    return { connection: existingConnection, secret };
  };

  probe = async (id: string, operation: "test" | "models") => {
    const { connection, secret } = await this.resolve(id);
    return probeConnection(connection, secret, operation);
  };
}
