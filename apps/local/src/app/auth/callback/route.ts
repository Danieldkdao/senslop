import { getSubscriptionService } from "../../../services/subscriptions/server-subscriptions";
import { getLocalRequestUrl } from "../../../features/workspace/lib/server-workspace";
import {
  ChatGptSignInError,
  formatChatGptSignInFailure,
} from "../../../services/subscriptions/errors";

export const GET = async (request: Request) => {
  let success = false;
  let failureMessage =
    "Sign-in did not complete. Return to Senslop and try again.";
  try {
    const callback = getLocalRequestUrl(request);
    const result = await getSubscriptionService().completeChatGpt(callback);
    if (result.status === "pending" && result.url) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: result.url,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (result.status !== "complete")
      throw new Error("Sign-in did not complete.");
    success = true;
  } catch (error) {
    // Only our fixed messages enter HTML; provider error text can contain secrets or markup.
    if (error instanceof ChatGptSignInError)
      failureMessage = formatChatGptSignInFailure(
        error.stage,
        error.invalidGrant,
      );
  }
  const message = success
    ? "You’re signed in. Return to Senslop to choose your models."
    : failureMessage;
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senslop sign-in</title><body><main><h1>${success ? "Signed in" : "Sign-in incomplete"}</h1><p>${message}</p><p>You can close this tab.</p></main></body></html>`,
    {
      status: success ? 200 : 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
      },
    },
  );
};
