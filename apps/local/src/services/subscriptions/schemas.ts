import { z } from "zod";
import { providerAccountSchema } from "@senslop/contracts";

export const chatGptCredentialsSchema = z.object({
  clientId: z.string().min(1).max(500),
  accessToken: z.string().min(1).max(65536),
  refreshToken: z.string().min(1).max(65536),
  idToken: z.string().min(1).max(65536),
  expiresAt: z.number(),
  scopes: z.array(z.string()).max(100),
  account: providerAccountSchema,
});
export type ChatGptCredentialsSchema = z.infer<typeof chatGptCredentialsSchema>;
