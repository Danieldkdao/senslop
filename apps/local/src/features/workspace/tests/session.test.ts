import { expect, test } from "vitest";
import { allowsLocalRequest } from "../lib/session";

const settings = { origin: "http://127.0.0.1:4317", token: "a".repeat(64) };
const headers = (values: Record<string, string> = {}) =>
  new Headers({
    host: "127.0.0.1:4317",
    authorization: `Bearer ${settings.token}`,
    ...values,
  });

test("local access requires the session capability and exact loopback host", () => {
  expect(allowsLocalRequest(headers(), settings)).toBe(true);
  expect(allowsLocalRequest(headers({ authorization: "" }), settings)).toBe(
    false,
  );
  expect(
    allowsLocalRequest(headers({ host: "evil.example:4317" }), settings),
  ).toBe(false);
  expect(
    allowsLocalRequest(headers({ origin: "https://evil.example" }), settings),
  ).toBe(false);
  expect(
    allowsLocalRequest(headers({ "sec-fetch-site": "cross-site" }), settings),
  ).toBe(false);
  expect(
    allowsLocalRequest(headers({ origin: settings.origin }), settings),
  ).toBe(true);
  expect(
    allowsLocalRequest(
      headers({
        authorization: "",
        cookie: `senslop-local-4317=${settings.token}`,
      }),
      settings,
    ),
  ).toBe(true);
});

test("two local workspaces use separate cookies on the same host", () => {
  expect(
    allowsLocalRequest(
      headers({
        authorization: "",
        cookie: `senslop-local-4318=${settings.token}`,
      }),
      settings,
    ),
  ).toBe(false);
});
