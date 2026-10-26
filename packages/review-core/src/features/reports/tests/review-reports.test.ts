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
