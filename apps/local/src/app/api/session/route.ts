import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/data/env/server";
import {
  allowsLocalRequest,
  localCookieName,
} from "@/features/workspace/lib/session";

export const GET = (request: Request) => {
  const origin = serverEnv.SENSLOP_LOCAL_ORIGIN;
  const token = serverEnv.SENSLOP_LOCAL_TOKEN;
  if (!origin || !token) return new Response(null, { status: 503 });
  const headers = new Headers(request.headers);
  headers.set(
    "authorization",
    `Bearer ${new URL(request.url).searchParams.get("token") ?? ""}`,
  );
  // Bootstrap needs the URL capability, even if another workspace cookie is present.
  headers.delete("cookie");
  if (!allowsLocalRequest(headers, { origin, token }))
    return new Response(null, { status: 403 });
  const destination = new URL("/", origin);
  const review = new URL(request.url).searchParams.get("review");
  if (review && z.uuid().safeParse(review).success)
    destination.searchParams.set("review", review);
  const file = new URL(request.url).searchParams.get("file");
  if (file && file.length <= 4096) destination.searchParams.set("file", file);
  const response = NextResponse.redirect(destination);
  response.cookies.set(localCookieName(origin), token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
};
