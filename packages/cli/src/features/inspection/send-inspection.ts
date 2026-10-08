import { MAX_SNAPSHOT_BYTES, PROTOCOL_VERSION } from "@senslop/contracts";
import type { FrozenSnapshot } from "../git/snapshot.js";
import { requireCredentials } from "../auth/credentials.js";
import { fetchStatus } from "../connection/fetch-status.js";
import { requestJSON, validatedSocketURL } from "../../lib/http.js";

export const sendInspection = async (snapshot: FrozenSnapshot) => {
  if (!snapshot.files.length)
    throw new Error(
      "No changed files to inspect. Choose another Git selection.",
    );
  const credentials = await requireCredentials();
  const status = await fetchStatus(credentials);
  if (!status)
    throw new Error(
      "Account unavailable. Check your connection or sign in again.",
    );
  const url = validatedSocketURL(status.connectionUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/preview";
  url.search = "";
  const body = JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    source: snapshot.source,
    files: snapshot.files,
    excluded: snapshot.excluded,
  });
  if (Buffer.byteLength(body) > MAX_SNAPSHOT_BYTES)
    throw new Error(
      "Inspection exceeds the 20 MiB transfer limit. Choose a smaller selection.",
    );
  return requestJSON<{ previewId: string; fileCount: number }>(
    url.origin,
    url.pathname,
    { method: "POST", body, signal: AbortSignal.timeout(120000) },
    credentials.token,
  );
};
