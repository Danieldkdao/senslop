import open from "open";
import { password, isCancel } from "@clack/prompts";
import { setTimeout as sleep } from "node:timers/promises";
import {
  formatProvider,
  isSubscriptionProvider,
  providerIds,
  saveConnectionSchema,
  type PublicConnectionSchema,
} from "@senslop/contracts";
import type { ParsedCliCommand } from "../commands/types.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import { CliError } from "../commands/errors.js";
import {
  confirmDestructive,
  integerOption,
  readTextInput,
  stringOption,
} from "../commands/input.js";

type SignIn = {
  id: string;
  status: "pending" | "complete" | "failed" | "canceled";
  url: string | null;
  error: string | null;
};

export const executeProviderCommand = async (
  client: WorkspaceClient,
  { name, args, values }: ParsedCliCommand,
) => {
  const id = args[0]!;
  switch (name) {
    case "providers list":
      return client.request("/api/providers");
    case "providers models":
      return client.request(
        `/api/providers/models?connectionId=${encodeURIComponent(id)}`,
      );
    case "providers test":
      return client.request("/api/providers", { action: "test", id });
    case "providers default":
      return client.request("/api/providers", {
        action: "default",
        id: id === "none" ? null : id,
      });
    case "providers delete":
      await confirmDestructive(
        values,
        "Delete this provider connection and its saved credential?",
      );
      return client.request("/api/providers", { action: "delete", id });
    case "providers cleanup":
      return client.request("/api/providers", { action: "cleanup" });
    case "providers sign-out":
      await confirmDestructive(
        values,
        "Disconnect this subscription provider?",
      );
      return client.request("/api/providers/subscriptions", {
        action: "sign-out",
        id,
      });
    case "providers cancel-sign-in":
      return client.request("/api/providers/subscriptions", {
        action: "cancel",
        id,
      });
    case "providers sign-in-status":
      return client.request(
        `/api/providers/subscriptions?id=${encodeURIComponent(id)}`,
      );
    case "providers sign-in": {
      if (id !== "chatgpt-subscription" && id !== "claude-code")
        throw new CliError(
          "Choose chatgpt-subscription or claude-code.",
          "invalid_arguments",
          2,
        );
      let signIn = await client.request<SignIn>(
        "/api/providers/subscriptions",
        { action: "sign-in", provider: id },
      );
      if (values.open && signIn.url) await open(signIn.url);
      if (values.wait) {
        if (!values.json && signIn.url)
          process.stderr.write(`Complete provider sign-in: ${signIn.url}\n`);
        const timeout = integerOption(values, "timeout", 600, 1, 3600) * 1000;
        const deadline = Date.now() + timeout;
        const signal = AbortSignal.timeout(timeout);
        try {
          while (signIn.status === "pending" && Date.now() < deadline) {
            await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
            signal.throwIfAborted();
            signIn = await client.request<SignIn>(
              `/api/providers/subscriptions?id=${signIn.id}`,
              undefined,
              "GET",
              signal,
            );
          }
        } catch (error) {
          if (!signal.aborted) throw error;
        }
        if (signIn.status === "pending" || signal.aborted)
          throw new CliError(
            "Timed out waiting for provider sign-in. Use providers sign-in-status to reconnect.",
            "timeout",
            5,
            { requestId: signIn.id },
          );
        if (signIn.status !== "complete")
          throw new CliError(signIn.error ?? `Sign-in ${signIn.status}.`);
      }
      return signIn;
    }
    case "providers save": {
      const file = stringOption(values, "file");
      const connectionId = stringOption(values, "id");
      const existing = connectionId
        ? (
            await client.request<{ connections: PublicConnectionSchema[] }>(
              "/api/providers",
            )
          ).connections.find((connection) => connection.id === connectionId)
        : undefined;
      if (connectionId && !existing)
        throw new CliError("Connection not found.");
      const provider = providerIds.find(
        (provider) =>
          provider === (stringOption(values, "provider") ?? existing?.provider),
      );
      let input: unknown;
      if (file) {
        if (
          values["key-stdin"] ||
          values.provider ||
          values.endpoint ||
          values.id ||
          values["remove-key"] ||
          values["context-window"]
        )
          throw new CliError(
            "Use --file alone for a connection JSON input.",
            "invalid_arguments",
            2,
          );
        input = JSON.parse(await readTextInput(file));
      } else {
        if (!provider || isSubscriptionProvider(provider))
          throw new CliError(
            "Choose an API/local --provider, or use providers sign-in for a subscription.",
            "invalid_arguments",
            2,
          );
        if (provider === "openai-compatible" && !existing?.models?.length)
          throw new CliError(
            "Use --file with connection JSON including model definitions to create an OpenAI-compatible provider. Flags can update a saved compatible provider with --id.",
            "invalid_arguments",
            2,
          );
        const preset = formatProvider(provider);
        let apiKey = values["key-stdin"]
          ? (await readTextInput("-")).trim()
          : "";
        if (values["key-stdin"] && !apiKey)
          throw new CliError(
            "The replacement API key is empty.",
            "invalid_arguments",
            2,
          );
        if (
          !apiKey &&
          !existing?.configured &&
          preset.keyRequired &&
          !values["remove-key"]
        ) {
          if (values.json || !process.stdin.isTTY || !process.stdout.isTTY)
            throw new CliError(
              "This provider requires a key. Pipe it with --key-stdin.",
              "configuration_required",
              2,
            );
          const entered = await password({
            message: `API key for ${preset.label}`,
          });
          if (isCancel(entered))
            throw new CliError("Canceled. No provider saved.", "canceled");
          apiKey = entered;
        }
        input = {
          ...(existing ? { id: existing.id } : {}),
          provider,
          name: existing?.name ?? preset.label,
          baseURL:
            stringOption(values, "endpoint") ??
            existing?.baseURL ??
            preset.baseURL,
          model: existing?.model ?? "",
          ...(provider === "openai-compatible"
            ? { models: existing?.models }
            : {}),
          contextWindow: values["context-window"]
            ? integerOption(values, "context-window", 256, 256, 2000000)
            : (existing?.contextWindow ?? null),
          apiKey,
          ...(values["remove-key"] ? { removeKey: true } : {}),
        };
      }
      const connection = saveConnectionSchema.parse(input);
      const saved = await client.request<{
        connection: PublicConnectionSchema;
        warning?: string | null;
      }>("/api/providers", { action: "save", connection });
      const check = await client
        .request("/api/providers", { action: "test", id: saved.connection.id })
        .then(
          (result) => ({ ok: true, result }),
          (error: Error) => ({ ok: false, message: error.message }),
        );
      return { ...saved, check };
    }
    default:
      throw new CliError(`Unsupported provider operation: ${name}.`);
  }
};
