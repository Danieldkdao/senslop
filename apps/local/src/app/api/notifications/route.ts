import { z } from "zod";
import {
  claimNotification,
  releaseNotification,
  listNotifications,
} from "@senslop/review-core/notifications";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../features/workspace/lib/server-workspace";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const workspace = getWorkspace();
    const root = await workspace.root();
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    if (!Number.isSafeInteger(after) || after < 0)
      throw new Error("Invalid event cursor.");
    return Response.json({
      events: listNotifications(workspace.store, root, after),
      latest: Number(
        workspace.store.database
          .prepare(
            "SELECT coalesce(max(sequence),0) AS latest FROM notification_events WHERE repository=?",
          )
          .get(root)?.latest ?? 0,
      ),
    });
  } catch {
    return Response.json(
      { message: "Notification activity unavailable." },
      { status: 400 },
    );
  }
};

const notificationActionSchema = z.object({
  action: z.union([z.literal("claim"), z.literal("release")]),
  id: z.string().min(1).max(500),
  owner: z.uuid(),
});
export type NotificationActionSchema = z.infer<typeof notificationActionSchema>;

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  try {
    const input = notificationActionSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const root = await workspace.root();
    if (input.action === "claim")
      return Response.json({
        claimed: claimNotification(
          workspace.store,
          root,
          input.id,
          input.owner,
        ),
      });
    releaseNotification(workspace.store, root, input.id, input.owner);
    return Response.json({ saved: true });
  } catch {
    return Response.json(
      { message: "Notification delivery unavailable." },
      { status: 400 },
    );
  }
};
