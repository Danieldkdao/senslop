import { createHash } from "node:crypto";
import {
  getWorkspace,
  protectLocalRoute,
} from "../../../../features/workspace/lib/server-workspace";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const GET = (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const { database } = getWorkspace().store;
    // data_version catches other connections; total_changes catches this connection's own writes.
    const workspace = fingerprint([
      database.prepare("PRAGMA data_version").get(),
      database.prepare("SELECT total_changes() AS changes").get(),
    ]);
    const settings = fingerprint(
      database
        .prepare("SELECT name, value FROM preferences ORDER BY name")
        .all(),
    );
    const providers = fingerprint(
      database.prepare("SELECT id, body FROM connections ORDER BY id").all(),
    );
    return Response.json(
      { workspace, settings, providers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { message: "Workspace updates are unavailable. Retry." },
      { status: 503 },
    );
  }
};
