import { z } from "zod";
import { subscriptionProviders } from "@senslop/contracts";

export const signInStatuses = [
  "pending",
  "complete",
  "failed",
  "canceled",
] as const;
export type SignInStatus = (typeof signInStatuses)[number];
export const subscriptionSignInSchema = z.object({
  id: z.uuid(),
  provider: z.enum(subscriptionProviders),
  status: z.enum(signInStatuses),
  url: z.url().nullable(),
  error: z.string().nullable(),
});
export type SubscriptionSignInSchema = z.infer<typeof subscriptionSignInSchema>;
export const subscriptionActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("sign-in"),
      provider: z.enum(subscriptionProviders),
    })
    .strict(),
  z.object({ action: z.literal("cancel"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("sign-out"), id: z.uuid() }).strict(),
]);
export type SubscriptionActionSchema = z.infer<typeof subscriptionActionSchema>;
