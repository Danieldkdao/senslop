import { getCurrentUser } from "@/lib/auth/helpers";
import { apiError, serviceUnavailable, websocketURL } from "@/lib/api";
import { db, DeviceTable } from "@senslop/database";
import { eq } from "drizzle-orm";

export const GET = async (request: Request) => {
  if (!request.headers.get("authorization")?.startsWith("Bearer "))
    return apiError("UNAUTHORIZED", "Sign in with senslop login.", 401);
  try {
    // Never let browser cookies override the supplied CLI credential.
    const headers = new Headers({
      authorization: request.headers.get("authorization")!,
    });
    const { user, session } = await getCurrentUser(headers);
    if (!user || !session)
      return apiError(
        "UNAUTHORIZED",
        "CLI credential expired or revoked. Run senslop login again.",
        401,
      );
    if (!user.emailVerified)
      return apiError(
        "EMAIL_NOT_VERIFIED",
        "Verify your email before connecting.",
        403,
      );
    const deviceId = session.id;
    await db
      .insert(DeviceTable)
      .values({
        id: deviceId,
        userId: user.id,
        sessionId: session.id,
        name: "Senslop CLI",
      })
      .onConflictDoNothing();
    const [existingDevice] = await db
      .select()
      .from(DeviceTable)
      .where(eq(DeviceTable.id, deviceId));
    return Response.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        deviceId,
        deviceName: existingDevice.name,
        connectionUrl: websocketURL(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return serviceUnavailable();
  }
};
