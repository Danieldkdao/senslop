import {
  sourceSelectionSchema,
  type SourceSelectionSchema,
} from "@senslop/contracts";

export const sourceFromOptions = (values: {
  commit?: string;
  range?: string;
  branch?: string;
  base?: string;
  "working-tree"?: boolean;
}): SourceSelectionSchema => {
  if (
    [
      values.commit !== undefined,
      values.range !== undefined,
      values.branch !== undefined,
      values["working-tree"] === true,
    ].filter(Boolean).length !== 1
  )
    throw new Error(
      "Choose exactly one of --commit, --range, --branch or --working-tree.",
    );
  if (values.base !== undefined && values.branch === undefined)
    throw new Error("--base can only be used with --branch.");
  if (values.branch !== undefined)
    return sourceSelectionSchema.parse({
      kind: "branch",
      branch: values.branch,
      base: values.base ?? "HEAD",
    });
  if (values.commit !== undefined)
    return sourceSelectionSchema.parse({
      kind: "commit",
      commit: values.commit,
    });
  if (values.range !== undefined) {
    const pair = values.range.split("..");
    if (
      pair.length !== 2 ||
      !pair[0] ||
      !pair[1] ||
      pair.some((p) => p.includes(".") && p.startsWith("."))
    )
      throw new Error(
        "Use an endpoint range BASE..HEAD, not a three-dot comparison.",
      );
    return sourceSelectionSchema.parse({
      kind: "range",
      base: pair[0],
      head: pair[1],
    });
  }
  return { kind: "working-tree" };
};
