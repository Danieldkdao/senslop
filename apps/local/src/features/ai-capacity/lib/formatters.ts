import type { ConnectionCapacitySchema } from "../schemas";

export const formatCapacityNumber = (value: number) =>
  value.toLocaleString("en-US");

export const formatCapacitySetting = (
  setting: keyof ConnectionCapacitySchema,
) => {
  switch (setting) {
    case "concurrency":
      return {
        label: "Concurrent requests",
        description:
          "Requests allowed at once, including context lookups; start at 1 for local models and increase only if memory allows.",
      };
    case "requestsPerMinute":
      return {
        label: "Requests per minute",
        description:
          "Request starts allowed per rolling minute; lower values reduce bursts but add waiting.",
      };
    case "inputTokensPerMinute":
      return {
        label: "Input tokens per minute",
        description:
          "Prompt, source, and tool-result tokens allowed per rolling minute; match your provider's input quota.",
      };
    case "outputTokensPerMinute":
      return {
        label: "Output tokens per minute",
        description:
          "Output tokens reserved per rolling minute; unused reservations are released when usage is reported.",
      };
    case "contextTokens":
      return {
        label: "Context budget",
        description:
          "Input and output budget per request, with 20% headroom; match the loaded context and configure non-Ollama servers separately.",
      };
    case "outputTokens":
      return {
        label: "Maximum output tokens",
        description:
          "Maximum tokens per response, including reasoning where counted; low limits can truncate findings, and subscriptions may use this as a planning budget.",
      };
    case "groupingInputTokens":
      return {
        label: "Grouping batch tokens",
        description:
          "Changed-code tokens targeted per grouping batch, excluding prompt and tool overhead; smaller batches use less memory but make more requests.",
      };
    case "reviewInputTokens":
      return {
        label: "Review batch tokens",
        description:
          "Changed-code tokens targeted per review batch; larger batches reduce requests but leave less room for supporting evidence.",
      };
  }
};

export const formatCapacityFeedback = (
  setting: keyof ConnectionCapacitySchema,
  profile: ConnectionCapacitySchema,
) => {
  const value = profile[setting];
  if (value === null) return "No Senslop quota; provider limits still apply.";
  switch (setting) {
    case "concurrency":
      return value === 1
        ? "One request at a time keeps peak memory lower."
        : value >= 5
          ? "High concurrency: watch memory use before increasing further."
          : "Requests can overlap; reduce this if memory becomes tight.";
    case "requestsPerMinute":
      return value <= 5
        ? "Low request rate: expect pauses between requests."
        : value > 60
          ? "High request rate: confirm your provider supports this allowance."
          : "Requests pause when this allowance is used.";
    case "inputTokensPerMinute":
      return value < profile.contextTokens
        ? "Below the context budget; large requests may not fit."
        : value >= 1000000
          ? "High throughput allowance; large local contexts still need sufficient memory."
          : "Reported usage adjusts reserved input tokens.";
    case "outputTokensPerMinute":
      return value < profile.outputTokens
        ? "Below maximum output; response caps are reduced to this allowance."
        : "Unused output reservations are released after generation.";
    case "contextTokens":
      return value > 64000
        ? "Large context: confirm server settings and available memory."
        : value < 8192
          ? "Small context: instructions and tools may not fit."
          : "A moderate context budget limits memory use.";
    case "outputTokens": {
      const effective = Math.min(
        value,
        Math.max(64, Math.floor(profile.contextTokens / 4)),
        profile.outputTokensPerMinute ?? Infinity,
      );
      return effective < value
        ? `Effective output cap: ${formatCapacityNumber(effective)} tokens.`
        : value >= 8000
          ? "Large output allowance may increase latency and memory use."
          : "Increase this if findings or summaries are cut short.";
    }
    case "groupingInputTokens":
    case "reviewInputTokens":
      return value >= 24000
        ? "Large batches trade fewer requests for higher memory use."
        : value <= 4000
          ? "Small batches use less context but make more requests."
          : "Moderate batches; adjust gradually and compare completion time.";
  }
};
