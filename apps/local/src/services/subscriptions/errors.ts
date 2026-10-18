import * as oauth from "oauth4webapi";
import { formatSubscriptionRequirements } from "../../features/providers/lib/formatters";

export type ChatGptSignInStage =
  | "callback-validation"
  | "registration-storage"
  | "token-exchange"
  | "identity-validation"
  | "plan-permission"
  | "credential-validation"
  | "credential-storage";

export const formatChatGptSignInFailure = (
  stage: ChatGptSignInStage,
  invalidGrant = false,
) => {
  switch (stage) {
    case "callback-validation":
      return "ChatGPT returned an expired, canceled, or mismatched sign-in callback. Start a fresh sign-in in Senslop.";
    case "registration-storage":
      return "Senslop could not save the ChatGPT client registration locally. Check that the workspace data directory is writable, then sign in again.";
    case "token-exchange":
      if (invalidGrant)
        return `OpenAI rejected the ChatGPT authorization code. It may have expired, already been used, or not matched this authorization. ${formatSubscriptionRequirements("chatgpt-subscription")} If OpenAI reports an unavailable permission, choose an eligible account and workspace before signing in again.`;
      return "Senslop could not exchange the ChatGPT authorization code for credentials. Start a fresh sign-in; if it continues, check your connection to OpenAI.";
    case "identity-validation":
      return "Senslop could not verify the ChatGPT identity token. Check your computer's clock and connection to OpenAI, then sign in again.";
    case "plan-permission":
      return `ChatGPT plan access is unavailable or was not authorized. ${formatSubscriptionRequirements("chatgpt-subscription")} Select an eligible account and workspace, then allow 'Use your ChatGPT plan' on OpenAI's sign-in page.`;
    case "credential-validation":
      return "OpenAI returned incomplete ChatGPT account credentials. Start a fresh sign-in; if it continues, retry later.";
    case "credential-storage":
      return "ChatGPT authorization was verified, but Senslop could not save the connection locally. Unlock your OS credential store, check that the workspace data directory is writable, then sign in again.";
  }
};

export class ChatGptSignInError extends Error {
  readonly invalidGrant: boolean;
  constructor(
    readonly stage: ChatGptSignInStage,
    cause?: unknown,
  ) {
    const invalidGrant =
      stage === "token-exchange" &&
      cause instanceof oauth.ResponseBodyError &&
      cause.error === "invalid_grant";
    super(formatChatGptSignInFailure(stage, invalidGrant), { cause });
    this.invalidGrant = invalidGrant;
    this.name = "ChatGptSignInError";
  }
}

export const getChatGptSignInDiagnostics = (error: ChatGptSignInError) => {
  const cause = error.cause;
  const knownCodes = [
    oauth.RESPONSE_BODY_ERROR,
    oauth.INVALID_RESPONSE,
    oauth.INVALID_REQUEST,
    oauth.RESPONSE_IS_NOT_JSON,
    oauth.PARSE_ERROR,
    oauth.JWT_TIMESTAMP_CHECK,
    oauth.JWT_CLAIM_COMPARISON,
    oauth.KEY_SELECTION,
    oauth.UNSUPPORTED_OPERATION,
    oauth.WWW_AUTHENTICATE_CHALLENGE,
  ];
  const code =
    cause instanceof oauth.OperationProcessingError ||
    cause instanceof oauth.ResponseBodyError ||
    cause instanceof oauth.WWWAuthenticateChallengeError
      ? cause.code
      : undefined;
  const providerError =
    cause instanceof oauth.ResponseBodyError &&
    [
      "invalid_grant",
      "invalid_client",
      "invalid_request",
      "invalid_scope",
      "unauthorized_client",
      "access_denied",
      "server_error",
      "temporarily_unavailable",
    ].includes(cause.error)
      ? cause.error
      : undefined;
  return {
    stage: error.stage,
    code: code && knownCodes.includes(code) ? code : undefined,
    providerError,
    statusCode:
      cause instanceof oauth.ResponseBodyError ||
      cause instanceof oauth.WWWAuthenticateChallengeError
        ? cause.status
        : undefined,
  };
};
