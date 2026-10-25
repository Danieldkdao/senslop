import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../../db/local-store";
import { WorkflowStore } from "../workflow-store";
import { FixTasks } from "../fix-tasks";
import { VerificationStore } from "../verification-store";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-workflow-"));
  directories.push(directory);
  const store = new LocalStore(join(directory, "reviews.sqlite"));
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
      files: [
        {
          path: "file.ts",
          oldPath: null,
          status: "M",
          before: "old",
          after: "bug",
          beforeHash: "a".repeat(64),
          afterHash: "b".repeat(64),
          binary: false,
          added: 1,
          deleted: 1,
          diff: "patch",
        },
      ],
      excluded: [],
    },
    null,
  );
  return { store, review, workflow: new WorkflowStore(store, "/repo") };
};
const finding = {
  title: "Wrong value",
  severity: "high" as const,
  problem: "Returns the wrong value.",
  path: "file.ts",
  side: "after" as const,
  start: 1,
  end: 1,
  code: "bug",
  fixPrompt: "Fix the value.",
};

test("identical expressions at separate locations remain distinct across a run and its replay", async () => {
  const { store, review, workflow } = await fixture();
  try {
    const jobId = randomUUID();
    const inputs = [finding, { ...finding, start: 20, end: 20 }];
    const first = workflow.observe(review, jobId, inputs);
    expect(new Set(first.map((item) => item.id)).size).toBe(2);
    expect(workflow.findings(review.id)).toHaveLength(2);
    expect(
      workflow.observe(review, jobId, inputs).map((item) => item.id),
    ).toEqual(first.map((item) => item.id));
    expect(
      workflow.observe(review, randomUUID(), inputs).map((item) => item.id),
    ).toEqual(first.map((item) => item.id));
    expect(
      workflow
        .observe(review, randomUUID(), [...inputs].reverse())
        .map((item) => item.id),
    ).toEqual(first.map((item) => item.id).reverse());
    expect(
      workflow
        .findings(review.id)
        .every((item) => item.observations.length === 3),
    ).toBe(true);
  } finally {
    store.close();
  }
});

test("decisions persist with optional reasons and repeated observations retain identity", async () => {
  const { store, review, workflow } = await fixture();
  try {
    const first = workflow.observe(review, randomUUID(), [finding])[0]!;
    workflow.decide(review.id, first.id, "dismissed", undefined, review);
    const repeated = workflow.observe(review, randomUUID(), [
      { ...finding, start: 20, end: 20 },
    ])[0]!;
    expect(repeated.id).toBe(first.id);
    expect(repeated.decision).toBe("dismissed");
    expect(repeated.observations).toHaveLength(2);
    workflow.decide(review.id, first.id, "open", "Reconsidered", review);
    expect(workflow.findings(review.id)[0]!.history).toHaveLength(2);
    expect(new WorkflowStore(store, "/other").findings(review.id)).toEqual([]);
  } finally {
    store.close();
  }
});

test("rounds preserve source and stale decisions cannot mutate the current round", async () => {
  const { store, review, workflow } = await fixture();
  try {
    const issue = workflow.observe(review, randomUUID(), [finding])[0]!;
    const next = store.saveReview(
      "/repo",
      {
        ...review,
        files: [
          { ...review.files[0]!, after: "fixed", afterHash: "c".repeat(64) },
        ],
      },
      null,
      false,
      {
        resyncMode: "keep",
        previousReviewId: review.id,
        expectedHash: review.hash,
        expectedRound: review.round,
      },
    );
    expect(workflow.rounds(review.id).map((round) => round.round)).toEqual([
      2, 1,
    ]);
    expect(workflow.round(review.id, 1)?.files[0]?.after).toBe("bug");
    expect(() =>
      workflow.decide(review.id, issue.id, "resolved", undefined, review),
    ).toThrow(/changed/);
    workflow.decide(review.id, issue.id, "resolved", undefined, next);
    expect(workflow.findings(review.id)[0]?.decision).toBe("resolved");
  } finally {
    store.close();
  }
});

test("ambiguous same-code issues stay separate and are proposed as possible matches", async () => {
  const { store, review, workflow } = await fixture();
  try {
    workflow.observe(review, randomUUID(), [finding]);
    workflow.observe(review, randomUUID(), [
      { ...finding, title: "Different failure" },
    ]);
    const findings = workflow.findings(review.id);
    expect(findings).toHaveLength(2);
    expect(
      findings.find(
        (item) => item.observations[0]?.evidence.title === "Different failure",
      )?.possibleMatches,
    ).toHaveLength(1);
  } finally {
    store.close();
  }
});

test("fix tasks retain selected findings and enforce claims and stale revisions", async () => {
  const { store, review, workflow } = await fixture();
  try {
    const issue = workflow.observe(review, randomUUID(), [finding])[0]!;
    const tasks = new FixTasks(store, "/repo");
    const task = tasks.create(review, {
      title: "Fix value",
      findingIds: [issue.id],
      workspaceKind: "current",
    });
    expect(task.findingIds).toEqual([issue.id]);
    expect(task.status).toBe("ready");
    expect(() =>
      tasks.claim(task.id, "Agent", { ...review, hash: "f".repeat(64) }),
    ).toThrow(/changed/);
    const claimed = tasks.claim(task.id, "Agent", review);
    expect(claimed.agent).toBe("Agent");
    expect(() => tasks.claim(task.id, "Other agent", review)).toThrow(
      /claimed/,
    );
    tasks.transition(task.id, "canceled", review, "Canceled by user");
    expect(tasks.get(task.id)?.activity).toHaveLength(3);
    expect(workflow.findings(review.id)[0]?.decision).toBe("open");
  } finally {
    store.close();
  }
});

test("verification outcomes never resolve findings and stale work cannot publish", async () => {
  const { store, review, workflow } = await fixture();
  try {
    const issue = workflow.observe(review, randomUUID(), [finding])[0]!;
    const verifications = new VerificationStore(store, "/repo");
    const run = verifications.create(review, [issue.id]);
    verifications.publish(run.id, [
      {
        findingId: issue.id,
        outcome: "apparently-fixed",
        explanation: "The guard addresses the original trigger.",
      },
    ]);
    expect(workflow.findings(review.id)[0]?.decision).toBe("open");
    expect(workflow.findings(review.id)[0]?.assessment?.outcome).toBe(
      "apparently-fixed",
    );
    const stale = verifications.create(review, [issue.id]);
    store.saveReview("/repo", { ...review, files: [] }, null, false, {
      resyncMode: "keep",
      previousReviewId: review.id,
      expectedHash: review.hash,
      expectedRound: review.round,
    });
    expect(() =>
      verifications.publish(stale.id, [
        {
          findingId: issue.id,
          outcome: "apparently-fixed",
          explanation: "Stale",
        },
      ]),
    ).toThrow(/changed/);
  } finally {
    store.close();
  }
});
