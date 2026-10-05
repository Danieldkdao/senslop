import { serverEnv } from "@/data/env/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { apiError, serviceUnavailable, websocketURL } from "@/lib/api";
import { issueTicket } from "@senslop/database";

export const POST = async (request: Request) => {
  if (request.headers.has("authorization"))
    return apiError(
      "BROWSER_SESSION_REQUIRED",
      "Open Senslop in your browser to subscribe to connection status.",
      401,
    );
  try {
    const origin = new URL(serverEnv.BETTER_AUTH_URL).origin;
    if (request.headers.get("origin") !== origin)
      return apiError(
        "INVALID_ORIGIN",
        "Connection tickets require the website origin.",
        403,
      );
    const { user, session } = await getCurrentUser(request.headers);
    if (!user || !session)
      return apiError("UNAUTHORIZED", "Sign in before connecting.", 401);
    if (!user.emailVerified)
      return apiError(
        "EMAIL_NOT_VERIFIED",
        "Verify your email before connecting.",
        403,
      );
    const ticket = await issueTicket(user.id, session.id, origin);
    return Response.json(
      { ...ticket, connectionUrl: websocketURL() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return serviceUnavailable();
  }
};
