import { expect, test } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "../../../db/local-store";
import {
  saveProjectPolicy,
  readProjectPolicy,
} from "../../workflow/project-policy";
import { WorkflowStore } from "../../workflow/workflow-store";
import { ReviewReports, renderReportHtml } from "../review-reports";

test("saved reports remain immutable and self-contained HTML escapes authored content", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-reports-"));
  const store = new LocalStore(join(directory, "state.sqlite"));
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
    );
    const reports = new ReviewReports(store, "/repo");
    const first = reports.generate(review.id, 1, false);
    store.changeReview("/repo", review.id, {
      action: "rename",
      title: "<script>alert(1)</script>",
    });
    const second = reports.generate(review.id, 1, false);
    expect(first.id).not.toBe(second.id);
    expect(reports.get(first.id)?.title).toBe(first.title);
    expect(renderReportHtml(second)).toContain("&lt;script&gt;");
    expect(renderReportHtml(second)).not.toContain("<script>");
    expect(new ReviewReports(store, "/other").get(first.id)).toBe(null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("report evidence is frozen to its round and current policy gates every view", () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-report-evidence-"));
  const store = new LocalStore(join(directory, "state.sqlite"));
  try {
    const text = "captured source\n";
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
            path: "source.ts",
            oldPath: null,
            status: "A",
            before: null,
            after: text,
            beforeHash: null,
            afterHash: createHash("sha256").update(text).digest("hex"),
            binary: false,
            added: 1,
            deleted: 0,
            diff: "",
          },
        ],
        excluded: [],
      },
      null,
    );
    const reports = new ReviewReports(store, "/repo");
    const report = reports.generate(review.id, 1, false);
    expect(reports.evidence(report.id, "source.ts")?.after).toBe(text);
    expect(() => reports.evidence(report.id, "other.ts")).toThrow();
    const workflow = new WorkflowStore(store, "/repo");
    const [finding] = workflow.observe(review, randomUUID(), [
      {
        title: "Captured regression",
        severity: "high",
        problem: "Original problem",
        path: "source.ts",
        side: "after",
        start: 1,
        end: 1,
        code: text.trim(),
        fixPrompt: "Fix the regression",
      },
    ]);
    const fixed = "fixed source\n";
    const next = store.saveReview(
      "/repo",
      {
        ...review,
        files: [
          {
            ...review.files[0]!,
            after: fixed,
            afterHash: createHash("sha256").update(fixed).digest("hex"),
          },
        ],
      },
      null,
      false,
      {
        previousReviewId: review.id,
        resyncMode: "keep",
        expectedHash: review.hash,
        expectedRound: review.round,
      },
    );
    workflow.assess(
      next.id,
      finding!.id,
      "apparently-fixed",
      "The fix is present",
      [],
      next,
    );
    workflow.decide(next.id, finding!.id, "resolved", undefined, next);
    const final = reports.generate(next.id, 2, false);
    const carried = final.sections.find(
      (section) => section.title === "Findings and decisions",
    )!.items[0]!;
    expect(carried.label).toContain("resolved");
    expect(carried.evidenceReview?.round).toBe(1);
    expect(reports.evidence(final.id, "source.ts", 1)?.after).toBe(text);
    saveProjectPolicy(store, "/repo", {
      ...readProjectPolicy(store, "/repo"),
      exclude: ["source.ts"],
    });
    expect(() => reports.evidence(report.id, "source.ts")).toThrow(/excluded/);
    expect(reports.export(report.id)?.sections[0]?.items[0]?.label).toBe(
      "Excluded evidence",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([false, true])(
  "report coverage filters excluded paths before counts and remaining work, organization %s",
  (organized) => {
    const directory = mkdtempSync(join(tmpdir(), "senslop-report-coverage-"));
    const store = new LocalStore(join(directory, "state.sqlite"));
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
          excluded: [],
          files: ["visible.ts", "private.ts"].map((path) => ({
            path,
            oldPath: null,
            status: "A",
            before: null,
            after: "export const value=1;",
            beforeHash: null,
            afterHash: "a".repeat(64),
            binary: false,
            added: 1,
            deleted: 0,
            diff: "",
          })),
        },
        null,
      );
      store.changeReview("/repo", review.id, {
        action: "complete",
        path: "visible.ts",
        complete: true,
      });
      store.changeReview("/repo", review.id, {
        action: "complete",
        path: "private.ts",
        complete: true,
      });
      if (organized)
        store.database
          .prepare("INSERT INTO review_precision VALUES (?,?,?)")
          .run(
            review.id,
            1,
            JSON.stringify({
              units: [
                {
                  id: "visible",
                  path: "visible.ts",
                  reviewed: true,
                  label: "Visible",
                },
                {
                  id: "private",
                  path: "private.ts",
                  reviewed: true,
                  label: "Confidential",
                },
              ],
            }),
          );
      saveProjectPolicy(store, "/repo", {
        ...readProjectPolicy(store, "/repo"),
        exclude: ["private.ts"],
      });
      const report = new ReviewReports(store, "/repo").generate(
        review.id,
        1,
        false,
      );
      expect(report.total).toBe(1);
      expect(report.reviewed).toBe(1);
      expect(
        report.sections
          .find((section) => section.title === "Review coverage")
          ?.items.map((item) => item.path),
      ).toEqual(["visible.ts"]);
      expect(JSON.stringify(report)).not.toContain("private.ts");
      expect(JSON.stringify(report)).not.toContain("Confidential");
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

const reportFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-report-regression-"));
  const store = new LocalStore(join(directory, "state.sqlite"));
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
          path: "source.ts",
          oldPath: null,
          status: "A",
          before: null,
          after: "secret source",
          beforeHash: null,
          afterHash: "b".repeat(64),
          binary: false,
          added: 1,
          deleted: 0,
          diff: "",
        },
      ],
      excluded: [],
    },
    null,
  );
  return {
    store,
    review,
    reports: new ReviewReports(store, "/repo"),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

test("verification explanations retain evidence policy in new and saved reports", async () => {
  const { VerificationStore } =
    await import("../../workflow/verification-store");
  const { store, review, reports, close } = reportFixture();
  try {
    const workflow = new WorkflowStore(store, "/repo");
    const finding = workflow.observe(review, randomUUID(), [
      {
        title: "Bug",
        severity: "high",
        problem: "Bug",
        path: "source.ts",
        side: "after",
        start: 1,
        end: 1,
        code: "secret source",
        fixPrompt: "Fix",
      },
    ])[0]!;
    const verification = new VerificationStore(store, "/repo");
    const run = verification.create(review, [finding.id]);
    verification.publish(run.id, [
      {
        findingId: finding.id,
        outcome: "present",
        explanation: "The source says secret source",
      },
    ]);
    const report = reports.generate(review.id, 1, false);
    expect(
      JSON.stringify(
        report.sections.find(
          (section) => section.title === "Verification history",
        ),
      ),
    ).toContain("secret source");
    const legacy = {
      ...report,
      id: randomUUID(),
      sections: report.sections.map((section) =>
        section.title === "Verification history"
          ? {
              ...section,
              items: [
                {
                  id: run.id,
                  label: "Verification / completed",
                  detail: "The source says secret source",
                },
              ],
            }
          : section,
      ),
    };
    store.database
      .prepare("INSERT INTO review_reports VALUES (?,?,?,?)")
      .run(legacy.id, review.id, 1, JSON.stringify(legacy));
    saveProjectPolicy(store, "/repo", {
      ...readProjectPolicy(store, "/repo"),
      exclude: ["source.ts"],
    });
    for (const output of [
      reports.get(legacy.id),
      reports.get(report.id),
      reports.export(report.id),
      reports.generate(review.id, 1, false),
    ]) {
      expect(
        JSON.stringify(
          output?.sections.find(
            (section) => section.title === "Verification history",
          ),
        ),
      ).not.toContain("secret source");
    }
  } finally {
    close();
  }
});

test("requirements inherit the brief across re-sync and prefer job-captured criteria", async () => {
  const { ReviewIntent } = await import("../../precision/review-intent");
  const { store, review, reports, close } = reportFixture();
  try {
    const intent = new ReviewIntent(store, "/repo");
    const brief = intent.saveBrief(review, 0, {
      request: "Keep data",
      criteria: [
        {
          id: "keep",
          text: "Preserve data",
          sourceQuote: "Keep data",
          checkIds: [],
        },
      ],
      documents: [],
      links: [],
    });
    const next = store.saveReview(
      "/repo",
      {
        ...review,
        files: [
          { ...review.files[0]!, after: "next", afterHash: "c".repeat(64) },
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
    expect(
      reports
        .generate(next.id, next.round, false)
        .sections.find((section) => section.title === "Requirements")?.items,
    ).toMatchObject([{ id: "keep" }]);
    const jobId = randomUUID();
    store.database
      .prepare("INSERT INTO ai_jobs(id,snapshot_id,body) VALUES (?,?,?)")
      .run(
        jobId,
        review.id,
        JSON.stringify({
          id: jobId,
          hash: next.hash,
          snapshotRound: next.round,
          kind: "review",
          reviewIntent: { brief },
          result: {
            requirements: {
              criteria: [
                {
                  criterionId: "keep",
                  status: "implemented",
                  explanation: "Data preserved",
                  questions: [],
                },
              ],
            },
          },
        }),
      );
    intent.saveBrief(next, brief.version, {
      ...brief,
      criteria: [{ ...brief.criteria[0]!, id: "new", text: "New requirement" }],
    });
    expect(
      reports
        .generate(next.id, next.round, false)
        .sections.find((section) => section.title === "Requirements")?.items,
    ).toMatchObject([{ id: "keep", label: "implemented / Preserve data" }]);
  } finally {
    close();
  }
});
