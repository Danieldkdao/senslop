import { headers } from "next/headers";
import { auth } from "./auth";

export const getCurrentUser = async (otherHeaders?: Headers) => {
  const h = otherHeaders ?? (await headers());
  const session = await auth.api.getSession({
    headers: h,
    query: { disableCookieCache: true },
  });

  return {
    userId: session?.user.id ?? null,
    user: session?.user ?? null,
    session: session?.session ?? null,
  };
};
