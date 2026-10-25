import { expect, test } from "vitest";
import { LocalStore } from "../../../db/local-store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { saveProjectPolicy } from "../project-policy";
import { projectPolicySchema } from "@senslop/contracts";
import { UsageStore } from "../usage-store";
test("usage reservations coordinate review budgets and unknown usage remains unknown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-usage-"));
  const store = new LocalStore(join(directory, "reviews.sqlite"));
  try {
    const review = store.saveReview(
      "/repo",
      {
        id: randomUUID(),
        protocolVersion: 1,
        source: {
          kind: "working-tree",
          base: "a".repeat(40),
          head: null,
          firstParent: false,
        },
        files: [],
        excluded: [],
      },
      null,
      false,
    );
    saveProjectPolicy(
      store,
      "/repo",
      projectPolicySchema.parse({ tokenBudget: 100 }),
    );
    const usage = new UsageStore(store, "/repo");
    const first = usage.reserve(review, "review", 60, {
      provider: "ollama",
      model: "test",
    });
    expect(() =>
      usage.reserve(review, "context", 50, {
        provider: "ollama",
        model: "test",
      }),
    ).toThrow(/Budget/);
    first.finish({ inputTokens: 10, outputTokens: 10 });
    const retry = usage.reserve(review, "review", 60, {
      provider: "ollama",
      model: "test",
    });
    retry.finish({});
    const records = usage.list(review.id);
    expect(records).toHaveLength(2);
    expect(records[1]?.inputTokens).toBeNull();
    expect(records[1]?.estimatedCost).toBeNull();
    expect(() =>
      usage.reserve(review, "context", 30, {
        provider: "ollama",
        model: "test",
      }),
    ).toThrow(/Budget/);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
