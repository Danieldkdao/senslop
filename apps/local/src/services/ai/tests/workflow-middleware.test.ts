import { WorkflowPolicyError } from "@senslop/review-core/policy";
import { formatAiError, isFatalAiError } from "../errors";
import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { wrapLanguageModel, generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { LocalStore } from "@senslop/review-core/storage";
import { UsageStore } from "@senslop/review-core/usage";
import { saveProjectPolicy } from "@senslop/review-core/policy";
import { projectPolicySchema } from "@senslop/contracts";
import { createWorkflowMiddleware } from "../workflow-middleware";

let directory: string;
let store: LocalStore;
let review: import("@senslop/contracts").SavedReviewSchema;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "senslop-workflow-model-"));
  store = new LocalStore(join(directory, "reviews.sqlite"));
  review = store.saveReview(
    "/fixture",
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
});
afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});
const model = () => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    wrapped: wrapLanguageModel({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          calls++;
          return {
            content: [{ type: "text", text: "Fixture" }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 10,
                noCache: 10,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 5, text: 5, reasoning: undefined },
            },
            warnings: [],
          };
        },
      }),
      middleware: createWorkflowMiddleware(
        {
          store,
          repository: "/fixture",
          review,
          task: "review",
          sourcePaths: ["context.ts"],
        },
        { provider: "openai-compatible", baseURL: "http://127.0.0.1:1234/v1" },
        "fixture",
      ),
    }),
  };
};

test("actual model requests record measured usage and reject an exhausted allowance before execution", async () => {
  const provider = model();
  await generateText({
    model: provider.wrapped,
    prompt: "Fixture",
    maxOutputTokens: 20,
    maxRetries: 0,
  });
  expect(new UsageStore(store, "/fixture").list(review.id)[0]).toMatchObject({
    inputTokens: 10,
    outputTokens: 5,
    completed: true,
    estimatedCost: null,
  });
  saveProjectPolicy(
    store,
    "/fixture",
    projectPolicySchema.parse({ tokenBudget: 16 }),
  );
  await expect(
    generateText({
      model: provider.wrapped,
      prompt: "Fixture",
      maxOutputTokens: 20,
      maxRetries: 0,
    }),
  ).rejects.toThrow(/Budget/);
  expect(provider.calls).toBe(1);
});

test("a policy change blocks excluded secondary context before a later model call", async () => {
  const provider = model();
  saveProjectPolicy(
    store,
    "/fixture",
    projectPolicySchema.parse({ exclude: ["context.ts"] }),
  );
  await expect(
    generateText({ model: provider.wrapped, prompt: "Fixture", maxRetries: 0 }),
  ).rejects.toThrow(/policy/i);
  expect(provider.calls).toBe(0);
});

test("local-only policies reject remote routing before the model is invoked", async () => {
  saveProjectPolicy(
    store,
    "/fixture",
    projectPolicySchema.parse({ inference: "local-only" }),
  );
  const remote = wrapLanguageModel({
    model: new MockLanguageModelV4({}),
    middleware: createWorkflowMiddleware(
      { store, repository: "/fixture", review, task: "context" },
      { provider: "openai", baseURL: "https://api.openai.com/v1" },
      "fixture",
    ),
  });
  await expect(
    generateText({ model: remote, prompt: "Fixture", maxRetries: 0 }),
  ).rejects.toThrow(/local-only/);
  expect(new UsageStore(store, "/fixture").list(review.id)).toHaveLength(0);
});

test("workflow policy and budget stops stay actionable and do not trigger automatic retries", () => {
  const error = new WorkflowPolicyError(
    "Budget reached. Completed work is preserved.",
  );
  expect(formatAiError(error)).toContain("Budget reached");
  expect(isFatalAiError(error)).toBe(true);
});
