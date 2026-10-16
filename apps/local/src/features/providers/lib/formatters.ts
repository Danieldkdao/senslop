import { isLocalEndpoint, type ProviderId } from "@senslop/contracts";

export const formatProvider = (provider: ProviderId) => {
  switch (provider) {
    case "openrouter":
      return {
        label: "OpenRouter",
        icon: "OpenRouter" as const,
        baseURL: "https://openrouter.ai/api/v1",
        keyRequired: true,
        contextWindow: false,
        description:
          "Connect to models from multiple providers with an OpenRouter API key.",
      };
    case "chatgpt":
      return {
        label: "OpenAI",
        icon: "OpenAI" as const,
        baseURL: "https://api.openai.com/v1",
        keyRequired: true,
        contextWindow: false,
        description:
          "Use an OpenAI API key. A ChatGPT subscription does not supply an API key.",
      };
    case "google":
      return {
        label: "Google",
        icon: "Google" as const,
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        keyRequired: true,
        contextWindow: false,
        description: "Connect to the Gemini API with a Google AI API key.",
      };
    case "anthropic":
      return {
        label: "Anthropic",
        icon: "Anthropic" as const,
        baseURL: "https://api.anthropic.com/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Configure Claude models with your Anthropic API key.",
      };
    case "grok":
      return {
        label: "xAI",
        icon: "XAI" as const,
        baseURL: "https://api.x.ai/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Connect using an xAI API key.",
      };
    case "llama-cpp":
      return {
        label: "llama.cpp",
        icon: "Meta" as const,
        baseURL: "http://localhost:9931/v1",
        keyRequired: false,
        contextWindow: true,
        description:
          "Run open models using llama.cpp's compatible server, or configure a remote server.",
      };
    case "lm-studio":
      return {
        label: "LM Studio",
        icon: "LmStudio" as const,
        baseURL: "http://localhost:1234/v1",
        keyRequired: false,
        contextWindow: false,
        description:
          "Start LM Studio's local server with a downloaded model, or use a remote compatible endpoint.",
      };
    case "ollama":
      return {
        label: "Ollama",
        icon: "Ollama" as const,
        baseURL: "http://localhost:11434",
        keyRequired: false,
        contextWindow: true,
        description:
          "Run Ollama with a downloaded model, or connect to your remote Ollama server.",
      };
    case "vercel":
      return {
        label: "Vercel AI Gateway",
        icon: "Vercel" as const,
        baseURL: "https://ai-gateway.vercel.sh/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Connect using your Vercel AI Gateway API key.",
      };
    case "mistral":
      return {
        label: "Mistral",
        icon: "Mistral" as const,
        baseURL: "https://api.mistral.ai/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Connect using your Mistral API key.",
      };
    case "deepseek":
      return {
        label: "Deepseek",
        icon: "DeepSeek" as const,
        baseURL: "https://api.deepseek.com/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Connect using your DeepSeek API key.",
      };
    case "opencode":
      return {
        label: "OpenCode",
        icon: "OpenCode" as const,
        baseURL: "https://opencode.ai/zen/v1",
        keyRequired: true,
        contextWindow: false,
        description: "Connect using your OpenCode Zen API key.",
      };
  }
};

export const formatEndpointLocation = (endpoint: string) =>
  isLocalEndpoint(endpoint)
    ? "Local endpoint, inference server on this computer"
    : "Remote endpoint, compatible does not mean local";

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
