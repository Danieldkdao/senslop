import type { ProviderId } from "@senslop/contracts";
import type { ModelCatalogSchema } from "../model-schemas";
import type { compatibleModelCapabilities } from "../constants";

import { formatProvider, compatibleModelTokenBounds } from "@senslop/contracts";
export {
  formatProvider,
  formatSubscriptionRequirements,
} from "@senslop/contracts";

export const formatContextWindow = (tokens: number) =>
  tokens.toLocaleString("en-US");

export const formatCompatibleCapability = (
  capability: (typeof compatibleModelCapabilities)[number],
) => {
  switch (capability) {
    case "supportsTools":
      return {
        label: "Supports tools",
        description:
          "Allow repository tools and context lookups. Turn off for models that cannot call tools.",
      };
    case "supportsImages":
      return {
        label: "Supports images",
        description:
          "Allow image input when it is supplied to this model. This does not add image uploads to chat.",
      };
    case "supportsParallelToolCalls":
      return {
        label: "Supports parallel tool calls",
        description:
          "Allow multiple tool calls in a model response. Requires tool support.",
      };
    case "supportsPromptCacheKey":
      return {
        label: "Supports prompt_cache_key",
        description:
          "Send a stable cache-routing key. Enable only if your endpoint accepts this field.",
      };
    case "supportsChatCompletions":
      return {
        label: "Supports /chat/completions",
        description:
          "Use Chat Completions. When off, the endpoint must support the Responses API.",
      };
    case "usesMaxTokens":
      return {
        label: "Uses max_tokens for output limit",
        description:
          "Use the legacy max_tokens field instead of max_completion_tokens for chat requests.",
      };
    case "supportsThinking":
      return {
        label: "Supports thinking",
        description:
          "Allow requested reasoning settings. This does not enable thinking automatically.",
      };
  }
};

export const formatCompatibleTokenField = (
  field: "maxCompletionTokens" | "maxOutputTokens" | "contextWindow",
) => {
  switch (field) {
    case "maxCompletionTokens":
      return {
        label: "Max completion tokens",
        description:
          "Maximum completion allowance accepted by the chat API. Requests also respect Max output tokens.",
        ...compatibleModelTokenBounds.maxCompletionTokens,
      };
    case "maxOutputTokens":
      return {
        label: "Max output tokens",
        description: "Maximum tokens this model can generate in one response.",
        ...compatibleModelTokenBounds.maxOutputTokens,
      };
    case "contextWindow":
      return {
        label: "Max tokens",
        description:
          "The model context window, including input and output tokens.",
        ...compatibleModelTokenBounds.contextWindow,
      };
  }
};

export const formatCompatibleTokenRange = (min: number, max: number) =>
  `Minimum ${min.toLocaleString("en-US")}; maximum ${max.toLocaleString("en-US")}.`;

export const formatConnectionLabel = (connection: {
  provider: ProviderId;
  name: string;
}) => {
  const label = formatProvider(connection.provider).label;
  switch (connection.name) {
    case "ChatGPT":
      if (label === "OpenAI") return label;
      break;
    case "Grok":
    case "X.AI":
      if (label === "xAI") return label;
      break;
  }
  return connection.name === label ? label : `${label}: ${connection.name}`;
};

export const formatModelName = (id: string) => {
  const model = id.replace(/^models\//, "");
  const name = model.split("/").at(-1) ?? model;
  return name
    .replace(/(\d)-(\d)(?=-|$)/g, "$1.$2")
    .split("-")
    .map((part) => {
      switch (part.toLowerCase()) {
        case "gpt":
          return "GPT";
        case "glm":
          return "GLM";
        case "deepseek":
          return "DeepSeek";
        case "minimax":
          return "MiniMax";
        case "qwen":
          return "Qwen";
        default:
          return part ? part[0].toUpperCase() + part.slice(1) : part;
      }
    })
    .join(" ");
};

export const formatCatalogModelName = (
  name: string,
  id: string,
  ambiguous: boolean,
) => {
  if (!ambiguous) return name;
  const label = `${name} (${id})`;
  return label.length <= 200 ? label : id;
};

export const formatModelOptionName = (
  name: string,
  connectionName: string,
  connectionNumber?: number,
) =>
  `${name} (${connectionName}${connectionNumber ? ` ${connectionNumber}` : ""})`;

export const formatProviderModelCheck = ({
  checking,
  error,
  catalog,
}: {
  checking: boolean;
  error?: string | null;
  catalog?: ModelCatalogSchema;
}) => {
  if (checking)
    return {
      state: "checking" as const,
      label: "checking models",
      message: "Checking the saved connection for available models…",
      className: "text-muted-foreground animate-spin",
    };
  const count = catalog?.models.filter((model) => model.available).length ?? 0;
  const failure =
    error ||
    (catalog?.source !== "live"
      ? (catalog?.message ??
        "Live model discovery is unavailable. Refresh the saved connection to retry.")
      : !count
        ? (catalog.message ??
          "No available models were found. Check your provider or server and retry.")
        : null);
  if (failure)
    return {
      state: "failed" as const,
      label: "model check failed",
      message: failure,
      className: "text-destructive",
    };
  return {
    state: "success" as const,
    label: "models available",
    message: `${count} ${count === 1 ? "model found" : "models found"} using the saved connection.${catalog?.message ? ` ${catalog.message}` : ""}`,
    className: "text-success",
  };
};
