import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/data/env/server";
import { allowsLocalRequest } from "@/features/workspace/lib/session";

export const proxy = (request: NextRequest) => {
  const origin = serverEnv.SENSLOP_LOCAL_ORIGIN;
  const token = serverEnv.SENSLOP_LOCAL_TOKEN;
  if (!origin || !token)
    return new NextResponse("Start the workspace with the Senslop CLI.", {
      status: 503,
    });
  if (request.headers.get("host") !== new URL(origin).host)
    return new NextResponse("Invalid local host.", { status: 403 });
  const bootstrap = request.nextUrl.pathname === "/api/session";
  if (!bootstrap && !allowsLocalRequest(request.headers, { origin, token }))
    return new NextResponse(
      "Open the workspace using the URL printed by your Senslop CLI.",
      { status: 403 },
    );
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
};

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};
