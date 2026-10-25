import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "@senslop/review-core/storage";
import { WorkflowStore } from "@senslop/review-core/workflow";
import { validateRequirementCoverage } from "@senslop/review-core/review-intent";
import {
  resolveReviewInstructions,
  applicableReviewProfiles,
  applicableReviewRules,
} from "@senslop/review-core/review-rules";
import {
  createReviewUnits,
  reconcileOrganization,
  validateOrganization,
} from "@senslop/review-core/review-units";
import type { PreviewFileSchema } from "@senslop/contracts";
import { analyzeLanguageSources } from "../../../services/analysis/language-adapters";
import type { ReviewEvaluationCase } from "../types";

export const checkPrecisionContracts = async (
  fixture: ReviewEvaluationCase,
  files: PreviewFileSchema[],
) => {
  const checks: string[] = [];
  const require = (condition: boolean, label: string) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const units = createReviewUnits(files);
  validateOrganization(reconcileOrganization(units));
  require(fixture.expectedUnitCount === undefined ||
    units.length ===
      fixture.expectedUnitCount, "Changed regions have unique, complete ownership");
  switch (fixture.scenario) {
    case "rounds": {
      const old = reconcileOrganization(units);
      old.units[0]!.reviewed = true;
      old.manual = true;
      const moved = createReviewUnits(
        files.map((file) => ({
          ...file,
          before: `prefix\n${file.before}`,
          after: `prefix\n${file.after}`,
        })),
      );
      const next = reconcileOrganization(moved, old);
      require(next.units.some(
        (unit) => unit.reviewed && unit.moved,
      ), "Unchanged moved source keeps manual progress");
      break;
    }
    case "requirements": {
      const unclear = fixture.id.includes("conflicting");
      const result = validateRequirementCoverage(
        {
          criteria: [
            {
              criterionId: "criterion",
              status: unclear ? "unclear" : "missing",
              explanation: unclear
                ? "Conflicting requested outcomes"
                : "Requested behavior absent",
              evidence: [],
              questions: unclear ? ["Which requested outcome applies?"] : [],
            },
          ],
          unexpectedChanges: [],
          limitations: [],
        },
        [
          {
            id: "criterion",
            text: "Requested outcome",
            sourceQuote: "Requested outcome",
            checkIds: [],
          },
        ],
        { sources: {} },
        [],
      );
      require(result.criteria[0]?.status ===
        (unclear ? "unclear" : "missing"), unclear
        ? "Conflicting requirements stay explicit questions"
        : "Missing behavior remains missing without source evidence");
      break;
    }
    case "rules": {
      const instructions = resolveReviewInstructions({
        ".senslop/review.json": JSON.stringify({
          profiles: ["correctness"],
          rules: [{ id: "rule", text: "Root rule" }],
        }),
        "api/.senslop/review.json": JSON.stringify({
          profiles: ["security"],
          rules: [{ id: "rule", text: "Scoped rule" }],
        }),
      });
      require(applicableReviewProfiles(instructions, "api/a.ts").includes(
        "security",
      ) &&
        !applicableReviewProfiles(instructions, "web/a.ts").includes(
          "security",
        ) &&
        applicableReviewRules(instructions, "api/a.ts")[0]?.source ===
          "api/.senslop/review.json", "Nested profiles and cited rule provenance stay scoped");
      break;
    }
    case "language": {
      const analysis = await analyzeLanguageSources(
        Object.fromEntries(files.map((file) => [file.path, file.after ?? ""])),
      );
      require(files.every(
        (file) => analysis.capabilities[file.path]?.level === "parsing",
      ) &&
        analysis.symbols.length >
          0, "Additional languages parse actual declarations without claiming semantic resolution");
      break;
    }
    case "misleading": {
      require(resolveReviewInstructions({
        [fixture.source.path]: fixture.source.after,
      }).rules.length ===
        0, "Source comments do not become controlling review rules");
      break;
    }
    case "verification": {
      const checkId = randomUUID();
      const criterion = {
        id: "criterion",
        text: "Behavior",
        sourceQuote: "Behavior",
        checkIds: [checkId],
      };
      const evidence = {
        path: fixture.source.path,
        side: "after" as const,
        start: 1,
        end: 1,
        code: fixture.source.after.split("\n")[0]!,
      };
      const input = {
        criteria: [
          {
            criterionId: criterion.id,
            status: "verified",
            explanation: "Source present",
            evidence: [evidence],
            questions: [],
          },
        ],
        unexpectedChanges: [],
        limitations: [],
      };
      require(validateRequirementCoverage(
        input,
        [criterion],
        { sources: { [fixture.source.path]: fixture.source.after } },
        [{ id: checkId, status: "failed" }],
      ).criteria[0]?.status ===
        "implemented", "Failed checks cannot establish requirement verification");
      require(validateRequirementCoverage(
        input,
        [criterion],
        { sources: { [fixture.source.path]: fixture.source.after } },
        [{ id: checkId, status: "passed" }],
      ).criteria[0]?.status ===
        "verified", "Explicit linked passing checks establish verification");
      const directory = mkdtempSync(join(tmpdir(), "senslop-corpus-"));
      const store = new LocalStore(join(directory, "corpus.sqlite"));
      try {
        const review = store.saveReview(
          "/synthetic",
          {
            id: randomUUID(),
            protocolVersion: 1,
            source: {
              kind: "working-tree",
              base: "a".repeat(40),
              head: null,
              firstParent: false,
            },
            files,
            excluded: [],
          },
          null,
        );
        const workflow = new WorkflowStore(store, "/synthetic");
        const findings = workflow.observe(review, randomUUID(), [
          {
            ...evidence,
            title: "First condition",
            severity: "medium",
            problem: "First failure condition",
            fixPrompt: "Fix first",
          },
          {
            ...evidence,
            title: "Independent condition",
            severity: "medium",
            problem: "Second failure condition",
            fixPrompt: "Fix second",
          },
        ]);
        workflow.assess(
          review.id,
          findings[0]!.id,
          "apparently-fixed",
          "Selected condition assessed",
          [],
          review,
        );
        const saved = workflow.findings(review.id);
        require(saved[0]?.assessment?.outcome === "apparently-fixed" &&
          saved[1]?.assessment?.outcome === "present" &&
          saved.every(
            (finding) => finding.decision === "open",
          ), "Selected fix assessment leaves independent findings and human decisions unchanged");
      } finally {
        store.close();
        rmSync(directory, { recursive: true, force: true });
      }
      break;
    }
  }
  return checks;
};
