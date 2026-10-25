import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "@senslop/review-core/storage";
import { CheckRunner } from "@senslop/review-core/checks";
import { getCheckRunner } from "../../../services/inngest/functions";
import { WorkflowStore } from "@senslop/review-core/workflow";
import { saveProjectPolicy } from "@senslop/review-core/policy";
import { projectPolicySchema } from "@senslop/contracts";
import { snapshotAnalysisVersion } from "../../../services/analysis/snapshot-analysis";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  store: null as unknown as LocalStore,
  allowed: true,
}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  getWorkspace: () => ({ store: state.store, root: async () => "/fixture" }),
  protectLocalRoute: () => state.allowed,
  readLocalBody: (request: Request) => request.json(),
}));
vi.mock("../../../services/inngest/functions", () => ({
  dispatchChecks: vi.fn(),
  dispatchVerifications: vi.fn(),
  getCheckRunner: vi.fn(),
}));
import { GET, POST } from "../../../app/api/workflow/route";

let directory: string;
let review: import("@senslop/contracts").SavedReviewSchema;
let finding: import("@senslop/contracts").TrackedFindingSchema;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "senslop-workflow-api-"));
  state.store = new LocalStore(join(directory, "reviews.sqlite"));
  state.allowed = true;
  review = state.store.saveReview(
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
      files: [
        {
          path: "value.ts",
          oldPath: null,
          status: "M",
          binary: false,
          before: "base",
          after: "bug",
          beforeHash: "a".repeat(64),
          afterHash: "b".repeat(64),
          diff: "",
          added: 1,
          deleted: 1,
        },
      ],
      excluded: [],
    },
    null,
    false,
  );
  finding = new WorkflowStore(state.store, "/fixture").observe(
    review,
    randomUUID(),
    [
      {
        title: "Guard value",
        severity: "high",
        path: "value.ts",
        side: "after",
        start: 1,
        end: 1,
        code: "bug",
        problem: "Null crash",
        fixPrompt: "Fix",
      },
    ],
  )[0]!;
  state.store.database.prepare("INSERT INTO ai_context VALUES (?,?)").run(
    review.id,
    JSON.stringify({
      hash: review.hash,
      round: review.round,
      sources: { "value.ts": "bug", "context.ts": "support" },
      before: { "value.ts": "base" },
      analysis: {
        version: snapshotAnalysisVersion,
        edges: [],
        symbols: [],
        cycles: [],
        diagnostics: [],
        limitations: [],
      },
      limitations: [],
    }),
  );
});
afterEach(async () => {
  state.store.close();
  await rm(directory, { recursive: true, force: true });
});
const write = (operation: object, identity = review) =>
  POST(
    new Request("http://localhost/api/workflow", {
      method: "POST",
      body: JSON.stringify({ review: identity, operation }),
    }),
  );

test("workflow endpoints require the local capability and reject stale mutations", async () => {
  state.allowed = false;
  expect(
    (
      await GET(
        new Request(`http://localhost/api/workflow?reviewId=${review.id}`),
      )
    ).status,
  ).toBe(403);
  state.allowed = true;
  expect(
    (
      await write(
        { action: "decision", findingId: finding.id, decision: "dismissed" },
        { ...review, hash: "f".repeat(64) },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await write({
        action: "decision",
        findingId: finding.id,
        decision: "dismissed",
      })
    ).status,
  ).toBe(200);
  expect(
    new WorkflowStore(state.store, "/fixture").findings(review.id)[0]?.decision,
  ).toBe("dismissed");
  expect(
    (
      await write({
        action: "assess",
        findingId: finding.id,
        outcome: "unverified",
      })
    ).status,
  ).toBe(200);
});

test("context inspection shows captured sources and excludes them after a policy change", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/workflow?reviewId=${review.id}&context=1&path=context.ts`,
    ),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    files: ["context.ts", "value.ts"],
    source: { after: "support" },
  });
  saveProjectPolicy(
    state.store,
    "/fixture",
    projectPolicySchema.parse({ exclude: ["context.ts"] }),
  );
  const blocked = await GET(
    new Request(
      `http://localhost/api/workflow?reviewId=${review.id}&context=1&path=context.ts`,
    ),
  );
  expect(blocked.status).toBe(400);
  expect(await blocked.text()).not.toContain("support");
});

test("a check can be canceled after its source round has advanced", async () => {
  const runner = new CheckRunner(state.store, "/fixture", "");
  vi.mocked(getCheckRunner).mockResolvedValue(runner);
  const check = runner.create(review, { command: "node --version" });
  state.store.saveReview("/fixture", { ...review, files: [] }, null, false, {
    resyncMode: "keep",
    previousReviewId: review.id,
    expectedHash: review.hash,
    expectedRound: review.round,
  });
  expect(
    (await write({ action: "cancel-check", checkId: check.id })).status,
  ).toBe(200);
  expect(runner.get(check.id)?.status).toBe("canceled");
});
