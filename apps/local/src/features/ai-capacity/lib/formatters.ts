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
          "Maximum requests in flight together, including context lookups and retries. Start at 1 on a local machine; increase gradually if memory stays comfortable.",
      };
    case "requestsPerMinute":
      return {
        label: "Requests per minute",
        description:
          "Spaces request starts over a rolling minute. Use your provider's allowance or lower it to reduce bursts. This controls frequency, not memory per request.",
      };
    case "inputTokensPerMinute":
      return {
        label: "Input tokens per minute",
        description:
          "Limits source, prompts, and tool results sent in a rolling minute. Match your provider's input quota. Lower values wait longer and may require smaller batches; an individual prompt must fit.",
      };
    case "outputTokensPerMinute":
      return {
        label: "Output tokens per minute",
        description:
          "Reserves each request's maximum output before starting, then uses reported usage when available. Set this when your provider has a separate output quota. Small allowances can serialize requests.",
      };
    case "contextTokens":
      return {
        label: "Context budget",
        description:
          "Application budget for input plus output per request, with 20% headroom. Match the model's actual loaded context. Smaller budgets reduce local memory pressure. Ollama receives this context size; other servers must be configured separately.",
      };
    case "outputTokens":
      return {
        label: "Maximum output tokens",
        description:
          "Upper bound requested per response, including reasoning where the provider counts it. Lower it for shorter, lighter generations; too low can truncate findings. Context lookups and summaries may use less. Subscription backends may not enforce this cap.",
      };
    case "groupingInputTokens":
      return {
        label: "Grouping batch tokens",
        description:
          "Target changed-code input per grouping batch. Smaller batches reduce peak context but make more requests. Prompt and tool overhead is added separately; available context may lower the target.",
      };
    case "reviewInputTokens":
      return {
        label: "Review batch tokens",
        description:
          "Target changed-code input per correctness-review batch. Start small for local models. Larger batches reduce request count but need more memory and leave less room for follow-up evidence.",
      };
  }
};

export const formatCapacityFeedback = (
  setting: keyof ConnectionCapacitySchema,
  profile: ConnectionCapacitySchema,
) => {
  const value = profile[setting];
  if (value === null)
    return "No app-imposed limit for this quota. Provider limits and retry delays still apply.";
  switch (setting) {
    case "concurrency":
      return value === 1
        ? "One request at a time keeps peak memory lower. Other work waits in the queue."
        : value >= 5
          ? "High concurrency: several contexts can occupy memory together. Increase only after testing your hardware or provider."
          : "Some requests can overlap. Watch memory and reduce this if the server struggles.";
    case "requestsPerMinute":
      return value <= 5
        ? "Low request rate: expect pauses between batches, context lookups, and retries."
        : value > 60
          ? "High request rate: confirm your provider supports it. Concurrency and token quotas still bound throughput."
          : "Requests wait when this rolling-minute allowance is used.";
    case "inputTokensPerMinute":
      return value < profile.contextTokens
        ? "Below the context budget: requests may need smaller batches. If the prompt itself cannot fit, raise this allowance."
        : value >= 1000000
          ? "High input allowance: allows substantial throughput. It does not make large local contexts fit in memory."
          : "Input is reserved conservatively before sending and reconciled against reported usage.";
    case "outputTokensPerMinute":
      return value < profile.outputTokens
        ? "Below maximum output: each request's output cap is lowered to this allowance, and later requests may wait."
        : "Unused output reservations are released when generation reports usage. Other requests may wait until then.";
    case "contextTokens":
      return value > 64000
        ? "Large context: local memory use can rise sharply, especially with concurrent requests. Match the loaded model and server."
        : value < 8192
          ? "Small context: fixed prompts and tool definitions may not fit even with tiny batches. Raise this if analysis reports a context budget error."
          : "A moderate context budget limits request size. Try a smaller budget before raising local concurrency.";
    case "outputTokens": {
      const effective = Math.min(
        value,
        Math.max(64, Math.floor(profile.contextTokens / 4)),
        profile.outputTokensPerMinute ?? Infinity,
      );
      return effective < value
        ? `Effective output is at most ${formatCapacityNumber(effective)} tokens because of the context budget or output quota.`
        : value >= 8000
          ? "Large output allowance: longer generations and more reserved capacity. Reduce if responses are slow or memory is tight."
          : "A compact output allowance. Increase it if complete findings or summaries are repeatedly cut short.";
    }
    case "groupingInputTokens":
    case "reviewInputTokens":
      return value >= 24000
        ? "Large batches: fewer requests, more context and memory per request. Context and token quotas can reduce the actual batch size."
        : value <= 4000
          ? "Small batches: lower peak context, but more requests and potentially longer total runtime."
          : "Moderate batches. Adjust one setting at a time and compare memory use and completion time.";
  }
};
