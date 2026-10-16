import {
  chatRequestSchema,
  chatResponseSchema,
  type ChatRequestSchema,
} from "../schemas";

export const sendTestMessage = async (
  input: ChatRequestSchema,
  signal: AbortSignal,
) => {
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid chat request.");
  const response = await fetch("/api/ai-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    signal,
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string"
        ? data.message
        : "The provider request failed. Retry when ready.",
    );
  return chatResponseSchema.parse(data);
};
