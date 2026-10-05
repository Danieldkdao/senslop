import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization, emailOTP } from "better-auth/plugins";
import { db } from "@senslop/database";
import { CLI_CLIENT_ID } from "@senslop/contracts";
import { serverEnv } from "@/data/env/server";
import { sendVerificationOtp } from "@/services/mailjet/emails/verification-emails";

export const auth = betterAuth({
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,
  trustedOrigins: [serverEnv.BETTER_AUTH_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  socialProviders: {
    google: {
      clientId: serverEnv.GOOGLE_CLIENT_ID,
      clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
    },
  },
  databaseHooks: {
    session: {
      delete: {
        after: async (deletedSession) => {
          const internalURL =
            serverEnv.CONNECTION_INTERNAL_URL ??
            serverEnv.CONNECTION_URL.replace(/^ws/, "http");
          try {
            await fetch(new URL("/internal/disconnect", internalURL), {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serverEnv.CONNECTION_INTERNAL_SECRET}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sessionId: deletedSession.id }),
              signal: AbortSignal.timeout(2000),
            });
          } catch {
            // Heartbeats also revalidate sessions if immediate disconnect is unavailable.
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
    sendOnSignIn: true,
  },
  session: { cookieCache: { enabled: false } },
  plugins: [
    bearer(),
    emailOTP({
      overrideDefaultEmailVerification: true,
      expiresIn: 15 * 60,
      changeEmail: {
        enabled: true,
      },
      sendVerificationOTP: async (data) => {
        await sendVerificationOtp(data);
      },
    }),
    deviceAuthorization({
      verificationUri: `${serverEnv.BETTER_AUTH_URL}/device`,
      validateClient: (id) => id === CLI_CLIENT_ID,
      expiresIn: "10m",
      interval: "5s",
    }),
  ],
});
