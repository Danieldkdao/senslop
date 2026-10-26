import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  reviewReportSchema,
  reviewBriefSchema,
  type ReviewReportSchema,
  type ReportItemSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "../workflow/workflow-store";
import {
  readProjectPolicy,
  allowsSourcePath,
} from "../workflow/project-policy";
import { ReviewIntent } from "../precision/review-intent";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export class ReviewReports {
  constructor(
    private store: LocalStore,
    private repository: string,
  ) {}

  list = (reviewId: string) =>
    this.store.getReview(this.repository, reviewId)
      ? this.store.database
          .prepare(
            "SELECT body FROM review_reports WHERE review_id=? ORDER BY rowid DESC",
          )
          .all(reviewId)
          .map((row) =>
            this.export(String(JSON.parse(String(row.body)).id), true)!,
          )
      : [];

  private read = (id: string) => {
    const row = this.store.database
      .prepare(
        "SELECT rr.body FROM review_reports rr JOIN reviews r ON r.id=rr.review_id WHERE rr.id=? AND r.repository=?",
      )
      .get(id, this.repository);
    return row ? reviewReportSchema.parse(JSON.parse(String(row.body))) : null;
  };

  get = (id: string): ReviewReportSchema | null => this.export(id, true);

  private assessmentPaths = (
    reviewId: string,
    findingIds: string[],
    round: number,
  ) => [
    ...new Set(
      new WorkflowStore(this.store, this.repository)
        .findings(reviewId)
        .filter((finding) => findingIds.includes(finding.id))
        .flatMap((finding) =>
          finding.observations
            .filter((observation) => observation.review.round <= round)
            .map((observation) => observation.evidence.path),
        ),
    ),
  ];

  evidence = (id: string, path: string, evidenceRound?: number) => {
    const report = this.get(id);
    if (!report) throw new Error("Report not found.");
    if (!allowsSourcePath(readProjectPolicy(this.store, this.repository), path))
      throw new Error("Evidence excluded by current source policy.");
    const identity =
      evidenceRound && evidenceRound !== report.review.round
        ? report.sections
            .flatMap((section) => section.items)
            .find(
              (item) =>
                item.path === path &&
                item.evidenceReview?.round === evidenceRound,
            )?.evidenceReview
        : report.review;
    if (!identity)
      throw new Error("This evidence round is not linked from the report.");
    const workflow = new WorkflowStore(this.store, this.repository);
    const current = workflow.requireReview(report.review.id);
    const round =
      current.hash === identity.hash && current.round === identity.round
        ? current
        : workflow.round(report.review.id, identity.round);
    if (!round || round.hash !== identity.hash)
      throw new Error("Captured round evidence is unavailable.");
    const file = round.files.find((item) => item.path === path);
    if (!file) throw new Error("This path is not part of the captured round.");
    return file;
  };

  generate = (
    id: string,
    round: number,
    includeSource: boolean,
  ): ReviewReportSchema =>
    this.store.transaction(() => {
      const workflow = new WorkflowStore(this.store, this.repository);
      const current = workflow.requireReview(id);
      const review =
        current.round === round ? current : workflow.round(id, round);
      if (!review) throw new Error("Captured review round unavailable.");
      const policy = readProjectPolicy(this.store, this.repository);
      const allowed = (path: string) => allowsSourcePath(policy, path);
      const identity = { id, hash: review.hash, round };
      const organizationRow = this.store.database
        .prepare(
          "SELECT body FROM review_precision WHERE review_id=? AND round=?",
        )
        .get(id, round);
      const organization = organizationRow
        ? (JSON.parse(String(organizationRow.body)) as {
            units: {
              id: string;
              path: string;
              reviewed: boolean;
              label: string;
            }[];
          })
        : null;
      const coverage: ReportItemSchema[] = organization
        ? organization.units
            .filter((unit) => allowed(unit.path))
            .map((unit) => ({
              id: unit.id,
              label: unit.reviewed ? "Reviewed" : "Unreviewed",
              detail: unit.label,
              path: unit.path,
              reviewId: id,
            }))
        : review.files
            .filter((file) => allowed(file.path))
            .map((file) => ({
              id: file.path,
              label: review.completedPaths.includes(file.path)
                ? "Reviewed"
                : "Unreviewed",
              detail: file.path,
              path: file.path,
              reviewId: id,
            }));
      const findings: ReportItemSchema[] = workflow
        .findings(id)
        .flatMap((finding) => {
          const observation = finding.observations
            .filter((item) => item.review.round <= round)
            .at(-1);
          if (!observation) return [];
          const evidence = observation.evidence;
          return [
            {
              id: finding.id,
              label: allowed(evidence.path)
                ? `${finding.decision} / ${evidence.severity} / ${evidence.title}`
                : "Excluded evidence",
              detail: allowed(evidence.path)
                ? [
                    evidence.problem,
                    finding.assessment?.review.round === round
                      ? `Assessment: ${finding.assessment.outcome.replaceAll("-", " ")}. ${finding.assessment.explanation}`
                      : "",
                    observation.review.round !== round
                      ? `Original evidence from round ${observation.review.round}.`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n")
                : "Evidence excluded by current source policy.",
              path: evidence.path,
              reviewId: id,
              evidenceReview: observation.review,
              location: {
                side: evidence.side,
                start: evidence.start,
                end: evidence.end,
              },
              ...(includeSource && allowed(evidence.path)
                ? { code: evidence.code }
                : {}),
            },
          ];
        });
      const notes = review.notes.map((note) => ({
        id: note.id,
        label: "Human note",
        detail: allowed(note.path)
          ? note.body
          : "Note excluded by current source policy.",
        path: note.path,
        ...(includeSource && allowed(note.path) && note.line
          ? { code: note.line.code }
          : {}),
      }));
      const jobs = this.store.database
        .prepare(
          "SELECT body FROM ai_jobs WHERE snapshot_id=? ORDER BY rowid DESC",
        )
        .all(id)
        .map((row) => JSON.parse(String(row.body)))
        .filter(
          (job) =>
            job.hash === review.hash && (job.snapshotRound ?? 1) === round,
        );
      const latestReview = jobs.find((job) => job.kind === "review");
      const brief = latestReview?.reviewIntent
        ? latestReview.reviewIntent.brief
          ? reviewBriefSchema.parse(latestReview.reviewIntent.brief)
          : null
        : new ReviewIntent(this.store, this.repository)
            .briefs(id)
            .find((item) => item.review.round <= round);
      const requirements: ReportItemSchema[] = (brief?.criteria ?? []).map(
        (criterion) => {
          const assessment = (
            latestReview?.reviewIntent?.brief?.version === brief?.version
              ? latestReview?.result?.requirements
              : undefined
          )?.criteria?.find(
            (entry: { criterionId: string }) =>
              entry.criterionId === criterion.id,
          );
          return {
            id: criterion.id,
            label: `${assessment?.status ?? "Unverified"} / ${criterion.text}`,
            detail:
              assessment?.explanation ??
              "No current-round assessment is available.",
          };
        },
      );
      const checks = this.store.database
        .prepare(
          "SELECT body FROM check_runs WHERE review_id=? ORDER BY rowid DESC",
        )
        .all(id)
        .map((row) => JSON.parse(String(row.body)))
        .filter(
          (check) =>
            check.review.hash === review.hash && check.review.round === round,
        );
      const questions: ReportItemSchema[] = (
        latestReview?.result?.requirements?.criteria ?? []
      ).flatMap((criterion: { criterionId: string; questions: string[] }) =>
        criterion.questions.map((question, index) => ({
          id: `${criterion.criterionId}:${index}`,
          label: "Unresolved question",
          detail: question,
        })),
      );
      const verification: ReportItemSchema[] = this.store.database
        .prepare(
          "SELECT body FROM finding_verifications WHERE review_id=? ORDER BY rowid DESC",
        )
        .all(id)
        .map((row) => JSON.parse(String(row.body)))
        .filter(
          (run) =>
            run.review.hash === review.hash && run.review.round === round,
        )
        .flatMap((run): ReportItemSchema[] => [
          {
            id: run.id,
            label: `Verification / ${run.status}`,
            detail:
              run.error ??
              (run.assessments.length
                ? "Assessments recorded below."
                : "No assessment recorded."),
            evidencePaths: this.assessmentPaths(id, run.findingIds, round),
          },
          ...run.assessments.map(
            (assessment: {
              findingId: string;
              outcome: string;
              explanation: string;
            }) => {
              const paths = this.assessmentPaths(
                id,
                [assessment.findingId],
                round,
              );
              const permitted = paths.length > 0 && paths.every(allowed);
              return {
                id: `${run.id}:${assessment.findingId}`,
                label: permitted
                  ? assessment.outcome.replaceAll("-", " ")
                  : "Excluded evidence",
                detail: permitted
                  ? assessment.explanation
                  : "Evidence excluded by current source policy.",
                evidencePaths: paths,
                path: paths[0],
                reviewId: id,
              };
            },
          ),
        ]);
      const tasks: ReportItemSchema[] = this.store.database
        .prepare(
          "SELECT body FROM fix_tasks WHERE review_id=? ORDER BY rowid DESC",
        )
        .all(id)
        .map((row) => JSON.parse(String(row.body)))
        .filter((task) => task.review.round <= round)
        .map((task) => ({
          id: task.id,
          label: `${task.status} / ${task.title}`,
          detail: `Agent ${task.agent ?? "unclaimed"}; constraints ${task.constraints}; suggested checks ${task.checks.join(", ")}`,
        }));
      const gitOperations = this.store.database
        .prepare("SELECT body FROM git_operations WHERE repository=?")
        .all(this.repository)
        .map((row) => JSON.parse(String(row.body)))
        .filter((operation) =>
          operation.coverage?.some(
            (entry: { reviewId: string; hash: string }) =>
              entry.reviewId === id && entry.hash === review.hash,
          ),
        );
      const gitItems: ReportItemSchema[] = gitOperations.map((operation) => ({
        id: operation.id,
        label: `Commit ${operation.commit}`,
        detail: operation.coverage
          .flatMap((entry: { round: number; paths: string[] }) =>
            entry.paths.map((path) => `Round ${entry.round}: ${path}`),
          )
          .join("\n"),
      }));
      const overrides: ReportItemSchema[] = this.store.database
        .prepare("SELECT body FROM checkpoint_records WHERE repository=?")
        .all(this.repository)
        .map((row) => JSON.parse(String(row.body)))
        .filter((entry) =>
          entry.refs?.some((ref: { localOid: string }) =>
            gitOperations.some(
              (operation) => operation.commit === ref.localOid,
            ),
          ),
        )
        .map((entry) => ({
          id: entry.id,
          label: "Push checkpoint override",
          detail: `${entry.reason} / ${entry.createdAt}`,
        }));
      const checkItems: ReportItemSchema[] = checks.map((check) => ({
        id: check.id,
        label: `${check.status} / ${check.command}`,
        detail: [
          `Exit ${check.exitCode ?? "unavailable"}`,
          `${check.durationMs ?? "unknown"} ms`,
          `${check.sourceSide} inputs`,
          check.error,
          check.artifacts?.length
            ? `Artifacts: ${check.artifacts.map((artifact: { path: string }) => artifact.path).join(", ")}`
            : "No artifacts recorded",
        ]
          .filter(Boolean)
          .join("; "),
      }));
      const limitations: ReportItemSchema[] = [
        ...new Set<string>([
          ...review.excluded.map((item) => `${item.path}: ${item.reason}`),
          ...jobs.flatMap((job) => job.result?.limitations ?? []),
          ...(latestReview ? [] : ["No correctness analysis for this round."]),
          ...(checks.length ? [] : ["No executable checks for this round."]),
        ]),
      ].map((detail, index) => ({
        id: `limitation-${index}`,
        label: "Limitation",
        detail,
      }));
      const pending = [
        ...questions,
        ...coverage.filter((item) => item.label === "Unreviewed"),
        ...findings.filter((item) => /^(open|accepted)\b/.test(item.label)),
        ...requirements.filter(
          (item) => !/^(verified|implemented)\b/i.test(item.label),
        ),
        ...checkItems.filter((item) => !item.label.startsWith("passed")),
      ];
      const report = reviewReportSchema.parse({
        id: randomUUID(),
        review: identity,
        title: review.title,
        createdAt: new Date().toISOString(),
        source: review.source,
        includeSource,
        reviewed: coverage.filter((item) => item.label === "Reviewed").length,
        total: coverage.length,
        sections: [
          { title: "Review coverage", items: coverage },
          { title: "Requirements", items: requirements },
          { title: "Findings and decisions", items: findings },
          { title: "Human notes", items: notes },
          { title: "Checks and artifacts", items: checkItems },
          { title: "Verification history", items: verification },
          { title: "Fix tasks", items: tasks },
          { title: "Git outcome", items: [...gitItems, ...overrides] },
          { title: "Unresolved questions", items: questions },
          { title: "Remaining work", items: pending },
          { title: "Limitations", items: limitations },
        ],
        provenance: {
          jobs: jobs.map((job) => ({
            id: job.id,
            kind: job.kind,
            status: job.status,
            settings: job.settings,
            instructions: job.reviewIntent?.instructions
              ? {
                  profiles: job.reviewIntent.instructions.profiles,
                  rules: job.reviewIntent.instructions.rules?.map(
                    (rule: {
                      id: string;
                      source: string;
                      paths: string[];
                    }) => ({
                      id: rule.id,
                      source: rule.source,
                      paths: rule.paths,
                    }),
                  ),
                  sources: job.reviewIntent.instructions.sources?.map(
                    (source: { path: string; contents: string }) => ({
                      path: source.path,
                      hash: createHash("sha256")
                        .update(source.contents)
                        .digest("hex"),
                    }),
                  ),
                }
              : null,
          })),
          source: review.source,
          hash: review.hash,
          round,
        },
        remainingWork: [
          `Review ${id}, round ${round}, source ${review.hash}`,
          ...pending.map(
            (item) =>
              `- ${item.label}${item.path ? ` in ${item.path}` : ""}: ${item.detail}`,
          ),
          ...notes.map(
            (note) => `- Human note in ${note.path}: ${note.detail}`,
          ),
          ...limitations.map((item) => `- Limitation: ${item.detail}`),
        ].join("\n"),
      });
      this.store.database
        .prepare("INSERT INTO review_reports VALUES (?,?,?,?)")
        .run(report.id, id, round, JSON.stringify(report));
      return this.export(report.id, includeSource)!;
    });

  export = (id: string, includeSource = false) => {
    const report = this.read(id);
    if (!report) return null;
    const policy = readProjectPolicy(this.store, this.repository);
    const exported = {
      ...report,
      includeSource: includeSource && report.includeSource,
      sections: report.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          let paths = item.evidencePaths ?? (item.path ? [item.path] : []);
          // Older reports stored all explanations in one pathless verification item.
          if (
            section.title === "Verification history" &&
            !item.evidencePaths &&
            !item.path
          ) {
            const row = this.store.database
              .prepare(
                "SELECT body FROM finding_verifications WHERE id=? AND review_id=?",
              )
              .get(item.id, report.review.id);
            const run = row ? JSON.parse(String(row.body)) : null;
            paths = run
              ? this.assessmentPaths(
                  report.review.id,
                  run.findingIds,
                  report.review.round,
                )
              : [];
          }
          const blocked =
            paths.some((path) => !allowsSourcePath(policy, path)) ||
            (section.title === "Verification history" && !paths.length);
          return {
            ...item,
            label: blocked ? "Excluded evidence" : item.label,
            detail: blocked
              ? "Evidence excluded by current policy."
              : item.detail,
            code:
              includeSource && !blocked && item.path ? item.code : undefined,
          };
        }),
      })),
    };
    exported.remainingWork = [
      `Review ${report.review.id}, round ${report.review.round}, source ${report.review.hash}`,
      ...exported.sections
        .filter((section) =>
          ["Remaining work", "Human notes", "Limitations"].includes(
            section.title,
          ),
        )
        .flatMap((section) =>
          section.items.map((item) => `- ${item.label}: ${item.detail}`),
        ),
    ].join("\n");
    return exported;
  };
}

export const renderReportHtml = (report: ReviewReportSchema) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(report.title)}</title><style>body{font:16px/1.6 system-ui;max-width:70rem;margin:2rem auto;padding:0 1rem}article{border-bottom:1px solid;padding:1rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{font-family:monospace}h1,h2,h3{line-height:1.3}</style></head><body><h1>${escapeHtml(report.title)}</h1><p>Round ${report.review.round} — ${escapeHtml(report.createdAt)}</p><p><code>${escapeHtml(report.review.hash)}</code></p><p>${report.reviewed} / ${report.total} regions reviewed</p>${report.sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${section.items.length ? section.items.map((item) => `<article><h3>${escapeHtml(item.label)}</h3>${item.path ? `<p><code>${escapeHtml(item.path)}</code></p>` : ""}<p>${escapeHtml(item.detail)}</p>${item.code ? `<pre>${escapeHtml(item.code)}</pre>` : ""}</article>`).join("") : "<p>No evidence recorded.</p>"}</section>`).join("")}<section><h2>Provenance</h2><pre>${escapeHtml(JSON.stringify(report.provenance, null, 2))}</pre></section></body></html>`;
