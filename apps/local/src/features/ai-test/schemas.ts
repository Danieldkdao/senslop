import { z } from "zod";
import { manualModelSchema } from "../providers/model-schemas";

export const chatMessageRoles = ["user", "assistant"] as const;
export type ChatMessageRole = (typeof chatMessageRoles)[number];

export const chatMessageSchema = z
  .object({
    role: z.enum(chatMessageRoles),
    content: z.string().min(1).max(65536),
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
      ),
  })
  .strict();
export type ChatRequestSchema = z.infer<typeof chatRequestSchema>;

export const chatFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Enter a message.")
    .max(8192, "Keep messages under 8,192 characters."),
});
export type ChatFormSchema = z.infer<typeof chatFormSchema>;

export const chatResponseSchema = z.object({
  text: z.string().min(1).max(65536),
});
export type ChatResponseSchema = z.infer<typeof chatResponseSchema>;
