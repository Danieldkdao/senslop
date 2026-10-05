"use client";

import { createAuthClient } from "better-auth/react";
import {
  deviceAuthorizationClient,
  emailOTPClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), deviceAuthorizationClient()],
});
