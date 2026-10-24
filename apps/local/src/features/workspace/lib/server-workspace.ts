import { serverEnv } from "../../../data/env/server";
import { LocalWorkspace } from "./local-workspace";
import { allowsLocalRequest } from "./session";

let workspace: LocalWorkspace | undefined;

export const getWorkspace = () => {
  const {
    SENSLOP_LOCAL_REPOSITORY: repository,
    SENSLOP_LOCAL_DIRECTORY: directory,
    SENSLOP_LOCAL_DATABASE: databasePath,
    SENSLOP_LOCAL_SNAPSHOT: snapshotPath,
  } = serverEnv;
  if (!repository || !databasePath || !snapshotPath)
    throw new Error("Start the local workspace using the Senslop CLI.");
  workspace ??= new LocalWorkspace({
    repository,
    directory,
    databasePath,
    snapshotPath,
  });
  return workspace;
};

export const protectLocalRoute = (request: Request) => {
  const origin = serverEnv.SENSLOP_LOCAL_ORIGIN;
  const token = serverEnv.SENSLOP_LOCAL_TOKEN;
  return (
    !!origin &&
    !!token &&
    allowsLocalRequest(request.headers, { origin, token })
  );
};

export const getLocalRequestUrl = (request: Request) => {
  const origin = serverEnv.SENSLOP_LOCAL_ORIGIN;
  if (!origin)
    throw new Error("Start the local workspace using the Senslop CLI.");
  const canonical = new URL(origin);
  if (request.headers.get("host") !== canonical.host)
    throw new Error("Invalid local host.");
  // NextRequest normalizes numeric loopback hosts; OAuth must retain the CLI's exact origin.
  const incoming = new URL(request.url);
  canonical.pathname = incoming.pathname;
  canonical.search = incoming.search;
  canonical.hash = "";
  return canonical;
};

export const readLocalBody = async (request: Request) => {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Use a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error("Request is too large.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
  }
};

export const localWorkspaceError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  return message ===
    "Local data was created by a newer Senslop. Upgrade the CLI to open it." ||
    message ===
      "The opened repository root changed. Restart the CLI in the intended repository."
    ? message
    : fallback;
};
