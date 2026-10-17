import type { SavedReviewSchema } from "@senslop/contracts";
import {
  groupingSchema,
  correctnessSchema,
  type FindingSchema,
  type CorrectnessSchema,
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
    if (formatPrompts) finding.fixPrompt = findingFixPrompt(finding);
    return true;
  });
  return result;
};

const individualFooter =
  "For this issue, determine whether it is valid and should be fixed. If so, fix it directly.";
const allIssuesFooter =
  "For each issue above, determine whether it is valid and should be fixed. If so, fix it directly.";

const fixGuidance = (finding: FindingSchema) => {
  const prompt = finding.fixPrompt.trim();
  const marker = "\n\n**Suggested fix**\n";
  if (
    prompt.startsWith("This is a comment left during a code review.") &&
    prompt.includes(marker)
  ) {
    return prompt
      .slice(prompt.indexOf(marker) + marker.length)
      .replace(`\n\n---\n\n${individualFooter}`, "")
      .trim();
  }
  const legacyMarker = `\nEvidence:\n${finding.code}\n\n`;
  if (
    prompt.startsWith("Fix the following verified finding from snapshot ") &&
    prompt.includes(legacyMarker)
  ) {
    return prompt
      .slice(prompt.indexOf(legacyMarker) + legacyMarker.length)
      .trim();
  }
  return prompt;
};

export const findingFixPrompt = (finding: FindingSchema) =>
  `This is a comment left during a code review.\nPath: ${finding.path}\nLine: ${finding.start}-${finding.end}\n\nComment:\n**${finding.title}**\n\n${finding.problem}\n\n**Suggested fix**\n${fixGuidance(finding)}\n\n---\n\n${individualFooter}`;

export const fixAllPrompt = (_snapshotId: string, result: CorrectnessSchema) =>
  `${result.findings.map((finding, index) => `### Issue ${index + 1}\n${finding.path}:${finding.start}-${finding.end}\n**${finding.title}**\n\n${finding.problem}\n\n${fixGuidance(finding)}`).join("\n\n")}\n\n---\n\n${allIssuesFooter}`;
