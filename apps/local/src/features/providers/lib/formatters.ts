import type { ProviderId } from "@senslop/contracts";
import type { ModelCatalogSchema } from "../model-schemas";

import { formatProvider } from "@senslop/contracts";
export {
  formatProvider,
  formatSubscriptionRequirements,
} from "@senslop/contracts";

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
