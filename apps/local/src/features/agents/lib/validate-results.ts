import type { SavedReviewSchema } from "@senslop/contracts";
import {
  groupingSchema,
  correctnessSchema,
  type FindingSchema,
} from "../schemas";

export class GroupingValidationError extends Error {
  name = "GroupingValidationError";
}

export const validateGrouping = (
  input: unknown,
  snapshot: SavedReviewSchema,
  members = snapshot.files.map((file) => file.path),
) => {
  const result = groupingSchema.parse(input);
  const paths = new Set(members);
  const relatedPaths = new Set(snapshot.files.map((file) => file.path));
  const seen = new Set<string>();
  for (const group of result.groups)
    for (const file of group.files) {
      if (!paths.has(file.path))
        throw new GroupingValidationError(
          "Grouping contains a path outside this snapshot.",
        );
      if (seen.has(file.path))
        throw new GroupingValidationError(
          "Grouping contains a duplicate file.",
        );
      seen.add(file.path);
      file.related = file.related.filter(
        (path) => relatedPaths.has(path) && path !== file.path,
      );
      if (snapshot.files.find((source) => source.path === file.path)?.binary)
        file.summary =
          "Binary file changed. Only metadata is available for review.";
    }
  if (seen.size !== paths.size)
    throw new GroupingValidationError(
      "Grouping coverage is incomplete. Retry grouping.",
    );
  return result;
};

const findingKey = (finding: FindingSchema) =>
  `${finding.path}:${finding.side}:${finding.start}:${finding.end}:${finding.title.toLowerCase()}`;

export const uniqueFindings = (findings: FindingSchema[]) => [
  ...new Map(
    findings.map((finding) => [findingKey(finding), finding]),
  ).values(),
];

export const validateReview = (
  input: unknown,
  snapshot: SavedReviewSchema,
  formatPrompts = true,
) => {
  const result = correctnessSchema.parse(input);
  const seen = new Set<string>();
  result.findings = result.findings.filter((finding) => {
    const file = snapshot.files.find((file) => file.path === finding.path);
    if (!file || file.binary)
      throw new Error("Finding does not reference text in this snapshot.");
    const text = file[finding.side];
    if (
      text === null ||
      finding.end < finding.start ||
      finding.end - finding.start > 100 ||
      finding.end > text.split("\n").length ||
      text
        .split("\n")
        .slice(finding.start - 1, finding.end)
        .join("\n") !== finding.code
    )
      throw new Error("Finding evidence does not match frozen source lines.");
    const hunks = [
      ...file.diff.matchAll(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g),
    ];
    if (
      hunks.length &&
      !hunks.some((hunk) => {
        const start = Number(hunk[finding.side === "before" ? 1 : 3]);
        const length = Number(hunk[finding.side === "before" ? 2 : 4] ?? 1);
        return (
          length > 0 &&
          finding.start <= start + length - 1 &&
          finding.end >= start
        );
      })
    )
      throw new Error("Finding is outside the selected change hunks.");
    const key = findingKey(finding);
    if (seen.has(key)) return false;
    seen.add(key);
    if (formatPrompts)
      finding.fixPrompt = `Fix the following verified finding from snapshot ${snapshot.id}. Recheck current source before editing.\n${finding.path} (${finding.side}, lines ${finding.start}–${finding.end})\n${finding.problem}\nEvidence:\n${finding.code}\n\n${finding.fixPrompt}`;
    return true;
  });
  return result;
};

export const fixAllPrompt = (
  snapshotId: string,
  result: ReturnType<typeof correctnessSchema.parse>,
) =>
  `${result.fixAllPrompt ? result.fixAllPrompt + "\n\n" : ""}Fix these findings from snapshot ${snapshotId}. Verify each against the current code; make minimal changes and run relevant tests.\n\n${result.findings.map((finding, index) => `${index + 1}. ${finding.severity}: ${finding.title}\n${finding.fixPrompt}`).join("\n\n")}`;
