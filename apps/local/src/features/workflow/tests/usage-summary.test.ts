import { expect, test } from "vitest";
import { summarizeUsage, groupUsage } from "../lib/usage-summary";
import { usageRecordSchema } from "@senslop/contracts";
const record = (id: string, inputTokens: number | null) =>
  usageRecordSchema.parse({
    id,
    reviewId: "11111111-1111-4111-8111-111111111111",
    round: 1,
    requestId: id,
    task: "review",
    provider: "fixture",
    model: "test",
    inputTokens,
    outputTokens: inputTokens === null ? null : 10,
    durationMs: 100,
    estimatedCost: null,
    createdAt: "2026-10-24T00:00:00.000Z",
    completed: true,
  });
test("usage totals retain unknown measurements and pricing", () => {
  const usage = [
    record("22222222-2222-4222-8222-222222222222", 20),
    record("33333333-3333-4333-8333-333333333333", null),
  ];
  expect(summarizeUsage(usage)).toMatchObject({
    tokens: 30,
    incomplete: true,
    cost: null,
  });
  expect(groupUsage(usage, "day")[0]).toMatchObject({
    inputTokens: 20,
    outputTokens: 10,
    durationMs: 200,
    unknown: 1,
  });
  expect(groupUsage([usage[1]!], "task")[0]?.inputTokens).toBeNull();
});
