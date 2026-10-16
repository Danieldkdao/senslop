import { z } from "zod";
import { manualModelSchema } from "../providers/model-schemas";

export const chatMessageRoles = ["user", "assistant"] as const;
export type ChatMessageRole = (typeof chatMessageRoles)[number];

export const chatMessageSchema = z
  .object({
    role: z
      .enum(chatMessageRoles)
      .describe(
        "Author of this test-chat message: user question or assistant response; system messages are not accepted.",
      ),
    content: z
      .string()
      .min(1)
      .max(65536)
      .describe(
        "Plain text message content; user questions are limited to 8,192 characters and saved assistant responses to 65,536.",
      ),
  })
  .strict()
  .refine(
    (message) => message.role === "assistant" || message.content.length <= 8192,
    {
      path: ["content"],
      message: "Keep messages under 8,192 characters.",
    },
  );
export type ChatMessageSchema = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = manualModelSchema
  .extend({
    messages: z
      .array(chatMessageSchema)
      .min(1)
      .max(49)
      .refine(
        (messages) =>
          messages.reduce(
            (size, message) => size + message.content.length,
            0,
          ) <= 32768,
        "This test conversation is too long. Start a new conversation.",
      )
      .refine(
        (messages) =>
          messages.length % 2 === 1 &&
          messages.every(
            (message, index) =>
              message.role === (index % 2 ? "assistant" : "user"),
          ),
        "Send alternating user and assistant messages, ending with a user message.",
      )
      .describe(
        "Chronological test-chat history alternating user and assistant messages, ending with a user question; at most 49 messages and 32,768 total characters.",
      ),
  })
  .strict();
export type ChatRequestSchema = z.infer<typeof chatRequestSchema>;

export const chatFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Enter a message.")
    .max(8192, "Keep messages under 8,192 characters.")
    .describe(
      "The user's next plain text question for the selected model in the provider test chat.",
    ),
});
export type ChatFormSchema = z.infer<typeof chatFormSchema>;

export const chatResponseSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(65536)
    .describe(
      "Nonempty assistant reply returned by the selected model for the test-chat request.",
    ),
});
export type ChatResponseSchema = z.infer<typeof chatResponseSchema>;
