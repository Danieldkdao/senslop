import { expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  origin: "http://127.0.0.1:3000",
  token: "a".repeat(64),
  workerToken: "b".repeat(64),
}));
vi.mock("../../../data/env/server", () => ({
  serverEnv: {
    SENSLOP_LOCAL_ORIGIN: state.origin,
    SENSLOP_LOCAL_TOKEN: state.token,
    SENSLOP_LOCAL_WORKER_TOKEN: state.workerToken,
  },
}));
import { NextRequest } from "next/server";
import { proxy } from "../../../proxy";

test("Inngest can normalize the callback host to localhost on the same port", () => {
  const worker = new NextRequest(
    `http://localhost:3000/api/inngest?token=${state.workerToken}`,
    { method: "PUT", headers: { host: "localhost:3000" } },
  );
  expect(proxy(worker).status).toBe(200);
  const wrong = new NextRequest(
    `http://localhost:4000/api/inngest?token=${state.workerToken}`,
    { method: "PUT", headers: { host: "localhost:4000" } },
  );
  expect(proxy(wrong).status).toBe(403);
});
test("worker exception does not bypass the normal workspace session", () => {
  const browser = new NextRequest("http://localhost:3000/api/agents", {
    headers: { host: "localhost:3000" },
  });
  expect(proxy(browser).status).toBe(403);
});

test("registration uses a persistent worker capability separate from the browser session", () => {
  const browserCapability = new NextRequest(
    `http://127.0.0.1:3000/api/inngest?token=${state.token}`,
    { method: "PUT", headers: { host: "127.0.0.1:3000" } },
  );
  expect(proxy(browserCapability).status).toBe(403);
});
