import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { localReturnPath } from "@/lib/auth/navigation";

export const proxy = async (request: NextRequest) => {
  const { pathname, search, searchParams } = request.nextUrl;
  const guestRoute = pathname === "/login" || pathname === "/signup";
  const protectedRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/device" ||
    pathname.startsWith("/device/");
  if (!guestRoute && !protectedRoute) return NextResponse.next();

  try {
    const { user, session } = await getCurrentUser(request.headers);
    if (user && session && user.emailVerified) {
      return guestRoute
        ? NextResponse.redirect(
            new URL(localReturnPath(searchParams.get("redirect")), request.url),
          )
        : NextResponse.next();
    }

    if (!user || !session) {
      if (guestRoute) return NextResponse.next();
      const login = new URL("/login", request.url);
      login.searchParams.set("redirect", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }

    if (
      pathname === "/login" &&
      searchParams.get("verify") === "1" &&
      searchParams.get("email") === user.email
    )
      return NextResponse.next();
    const login = new URL("/login", request.url);
    login.searchParams.set("verify", "1");
    login.searchParams.set("email", user.email);
    login.searchParams.set(
      "redirect",
      guestRoute
        ? localReturnPath(searchParams.get("redirect"))
        : `${pathname}${search}`,
    );
    return NextResponse.redirect(login);
  } catch {
    return new NextResponse(
      "Account services are unavailable. Please try again.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};

export const config = {
  matcher: ["/dashboard/:path*", "/device/:path*", "/login", "/signup"],
};
