import { z } from "zod";

export const reviewLineSides = ["additions", "deletions"] as const;
export type ReviewLineSide = (typeof reviewLineSides)[number];

export const reviewNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(5000, "Keep your message under 5,000 characters."),
});
export type ReviewNoteSchema = z.infer<typeof reviewNoteSchema>;
