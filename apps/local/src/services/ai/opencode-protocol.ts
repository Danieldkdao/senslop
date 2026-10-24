export type OpenCodeProtocol = "responses" | "messages" | "gemini" | "chat";

// Zen's public catalog omits protocol metadata; keep this routing aligned with its docs.
export const getOpenCodeProtocol = (
  modelId: string,
): OpenCodeProtocol | null => {
  if (modelId.startsWith("claude-")) return "messages";
  if (modelId.startsWith("gemini-")) return "gemini";
  if (
    ["gpt-", "grok-", "muse-spark-", "muse-wonder-"].some((prefix) =>
      modelId.startsWith(prefix),
    )
  )
    return "responses";
  switch (modelId) {
    case "qwen3.8-flash":
    case "qwen3.7-max":
    case "qwen3.7-plus":
    case "qwen3.6-plus":
    case "qwen3.5-plus":
      return "messages";
    case "qwen3.8-max":
    case "big-pickle":
    case "space-bunny-free":
    case "exo-free":
    case "beam-free":
    case "flint-40b-free":
      return "chat";
  }
  if (
    [
      "deepseek-",
      "minimax-",
      "glm-",
      "kimi-",
      "mistral-",
      "longcat-",
      "step-",
      "mimo-",
      "ling-",
      "nemotron-",
    ].some((prefix) => modelId.startsWith(prefix))
  )
    return "chat";
  return null;
};
