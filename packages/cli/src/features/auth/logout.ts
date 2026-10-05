import { log } from "@clack/prompts";
import { readCredentials, removeCredentials } from "./credentials.js";
import { requestJSON } from "../../lib/http.js";

export const logout = async () => {
  const credentials = await readCredentials();
  if (!credentials) {
    log.info("Already signed out.");
    return;
  }
  await requestJSON(
    credentials.baseURL,
    "/api/auth/sign-out",
    { method: "POST", body: "{}" },
    credentials.token,
  );
  // Better Auth can return success after a database deletion failure.
  let revoked = false;
  try {
    await requestJSON(
      credentials.baseURL,
      "/api/cli/status",
      {},
      credentials.token,
    );
  } catch (error) {
    revoked =
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 401;
  }
  if (!revoked)
    throw new Error(
      "Server sign-out could not be confirmed. Your CLI credential is still saved; retry senslop logout.",
    );
  await removeCredentials();
  log.success(
    "CLI credential revoked and removed. Your saved website reviews remain available.",
  );
};
