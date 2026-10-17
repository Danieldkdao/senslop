import { z } from "zod";
import {
  protectLocalRoute,
  readLocalBody,
  getLocalRequestUrl,
} from "../../../../features/workspace/lib/server-workspace";
import { subscriptionActionSchema } from "../../../../features/providers/subscription-schemas";
import { getSubscriptionService } from "../../../../services/subscriptions/server-subscriptions";

export const GET = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success)
    return Response.json(
      { message: "Choose a sign-in request." },
      { status: 400 },
    );
  try {
    return Response.json(getSubscriptionService().status(id.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Sign-in request expired. Sign in again." },
      { status: 404 },
    );
  }
};

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return Response.json(
      { message: "Invalid local session." },
      { status: 403 },
    );
  const input = subscriptionActionSchema.safeParse(
    await readLocalBody(request).catch(() => null),
  );
  if (!input.success)
    return Response.json(
      { message: "Invalid subscription request." },
      { status: 400 },
    );
  try {
    const service = getSubscriptionService();
    switch (input.data.action) {
      case "sign-in":
        return Response.json(
          await service.start(
            input.data.provider,
            getLocalRequestUrl(request).origin,
          ),
        );
      case "cancel":
        service.cancel(input.data.id);
        return Response.json(null);
      case "sign-out":
        return Response.json(await service.signOut(input.data.id));
    }
  } catch {
    return Response.json(
      {
        message:
          "Account connection could not be updated. Unlock the OS credential store and retry.",
      },
      { status: 422 },
    );
  }
};
