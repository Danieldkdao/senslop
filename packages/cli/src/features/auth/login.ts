import { setTimeout as sleep } from "node:timers/promises";
import { cancel, log, note, spinner } from "@clack/prompts";
import open from "open";
import { CLI_CLIENT_ID, secureBaseURL } from "@senslop/contracts";
import { requestJSON } from "../../lib/http.js";
import { saveCredentials, readCredentials } from "./credentials.js";

type DeviceCodes = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

export const login = async (value: string) => {
  const baseURL = secureBaseURL(value);
  if (await readCredentials())
    throw new Error(
      "A CLI account is already saved. Run senslop logout before switching accounts or signing in again.",
    );
  const data = await requestJSON<DeviceCodes>(
    baseURL,
    "/api/auth/device/code",
    {
      method: "POST",
      body: JSON.stringify({ client_id: CLI_CLIENT_ID }),
    },
  );
  const verification = new URL(data.verification_uri, baseURL);
  if (verification.origin !== baseURL)
    throw new Error("Verification URL must be on the Senslop website.");
  note(
    `Open ${verification.href} in your browser.\nEnter this code from your terminal: ${data.user_code}`,
    "Approve this device",
  );
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const progress = spinner();
  progress.start("Waiting for browser approval…");
  let interval = Math.max(data.interval || 5, 1) * 1000;
  const deadline = Date.now() + data.expires_in * 1000;
  try {
    try {
      await open(verification.href);
    } catch {
      log.warn("Could not open your browser. Open the URL above to continue.");
    }
    while (Date.now() < deadline && !abort.signal.aborted) {
      await sleep(interval, undefined, { signal: abort.signal });
      if (abort.signal.aborted) break;
      try {
        const token = await requestJSON<{ access_token: string }>(
          baseURL,
          "/api/auth/device/token",
          {
            method: "POST",
            body: JSON.stringify({
              client_id: CLI_CLIENT_ID,
              device_code: data.device_code,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
          },
        );
        if (!token.access_token)
          throw new Error("The website did not return a session credential.");
        if (abort.signal.aborted) break;
        await saveCredentials({ baseURL, token: token.access_token });
        progress.stop("Device approved.");
        log.success("Signed in.");
        return true;
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        if (code === "authorization_pending") continue;
        if (code === "slow_down") {
          interval += 5000;
          continue;
        }
        if (code === "access_denied")
          throw new Error(
            "Device connection was denied. Run senslop login to try again.",
          );
        if (code === "expired_token") break;
        throw error;
      }
    }
    if (!abort.signal.aborted)
      throw new Error(
        "Device code expired. Run senslop login to request another code.",
      );
  } catch (error) {
    if (!abort.signal.aborted) {
      progress.error("Sign-in did not complete.");
      throw error;
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  progress.cancel("Sign-in cancelled.");
  cancel("Sign-in cancelled. No credential saved.");
  return false;
};
