import { timingSafeEqual } from "node:crypto";

export type LocalSession = { origin: string; token: string };

export const localCookieName = (origin: string) =>
  `senslop-local-${new URL(origin).port}`;

export const matchesLocalToken = (value: string, expected: string) => {
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
};

export const allowsLocalRequest = (
  headers: Headers,
  { origin, token }: LocalSession,
) => {
  if (headers.get("host") !== new URL(origin).host) return false;
  const requestOrigin = headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return false;
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const cookie =
    headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${localCookieName(origin)}=`))
      ?.slice(localCookieName(origin).length + 1) ?? "";
  return matchesLocalToken(bearer, token) || matchesLocalToken(cookie, token);
};
