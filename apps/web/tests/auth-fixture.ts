import { betterAuth, type BetterAuthOptions } from "better-auth";

// Transport tests create disposable accounts without sending verification emails.
export const createEmailFreeAuthFixture = (options: BetterAuthOptions) =>
  betterAuth({
    ...options,
    emailVerification: {
      ...options.emailVerification,
      sendOnSignUp: false,
    },
  });
