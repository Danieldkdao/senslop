import { scheduleGrouping } from "../../../services/inngest/functions";
import {
  getWorkspace,
  localWorkspaceError,
  protectLocalRoute,
} from "@/features/workspace/lib/server-workspace";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const preview = await getWorkspace().current();
    if (preview) await scheduleGrouping(preview.id);
    const etag = `W/"${preview?.id ?? "empty"}-${preview?.revision ?? 0}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return Response.json(preview, { headers });
  } catch (error) {
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          "Saved review could not be loaded. Check that your local application-data directory is writable, then retry. Your saved data has been retained.",
        ),
      },
      { status: 503 },
    );
  }
};

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const preview = await getWorkspace().current();
    if (preview) await scheduleGrouping(preview.id);
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json(
      {
        message: localWorkspaceError(
          error,
          "Inspection could not be saved. Check application-data permissions and retry.",
        ),
      },
      { status: 503 },
    );
  }
};
