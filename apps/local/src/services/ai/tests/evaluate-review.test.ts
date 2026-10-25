import { expect, test, vi } from "vitest";
import { evaluateReviewModel } from "../evaluate-review";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ calls: 0 }));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: async () => {
    state.calls++;
    throw new Error("Provider response was interrupted.");
  },
}));
vi.mock("../../../features/agents/lib/agent-store", () => ({
  AgentStore: class {
    settings = () => ({
      separate: false,
      shared: { connectionId: "fixture", modelId: "fixture" },
      prompt: "Group by behavior.",
    });
  },
}));
vi.mock("../provider-connection", () => ({
  resolveProviderConnection: async () => ({
    connection: { provider: "llama-cpp", baseURL: "http://127.0.0.1:1" },
    secret: null,
  }),
}));
vi.mock("../provider-runtime", () => ({ resolveLanguageModel: () => ({}) }));
vi.mock("@senslop/review-core/policy", async (original) => ({
  ...(await original<typeof import("@senslop/review-core/policy")>()),
  readProjectPolicy: () => ({
    inference: "configured",
    tokenBudget: 10000,
    timeLimitSeconds: null,
  }),
}));

test("failed live requests retain their reservation instead of spending the allowance again on every case", async () => {
  state.calls = 0;
  const run = await evaluateReviewModel(
    {} as never,
    "/fixture",
    new AbortController().signal,
  );
  expect(state.calls).toBe(1);
  expect(run.cases.every((item) => !item.contractPassed)).toBe(true);
  expect(
    run.cases.some((item) =>
      item.limitations.some((limitation) =>
        /allowance reached/.test(limitation),
      ),
    ),
  ).toBe(true);
  expect(run.totals.inputTokens).toBeNull();
});
