import type { SavedReviewSchema } from "@senslop/contracts";
import type { GroupingSchema } from "../../features/agents/schemas";
import { validateGrouping } from "../../features/agents/lib/validate-results";

export const prepareIncrementalGrouping = (
  snapshot: SavedReviewSchema,
  previous: SavedReviewSchema,
  grouping: GroupingSchema,
) => {
  const paths = new Set(snapshot.files.map((file) => file.path));
  const unchanged = new Set(
    snapshot.files
      .filter((file) =>
        previous.files.some(
          (old) =>
            old.path === file.path &&
            old.beforeHash === file.beforeHash &&
            old.afterHash === file.afterHash,
        ),
      )
      .map((file) => file.path),
  );
  const aliases = grouping.groups.map((group, index) => ({
    key: `existing-group-${index + 1}`,
    title: group.title,
    index,
  }));
  const context = {
    groups: grouping.groups
      .map((group, index) => ({
        ...group,
        title:
          aliases.find((alias) => alias.index === index)?.key ?? group.title,
        files: group.files
          .filter((file) => paths.has(file.path))
          .map((file) => ({
            ...file,
            related: file.related.filter((path) => paths.has(path)),
          })),
      }))
      .filter((group) => group.files.length),
  };
  const retained = {
    groups: context.groups
      .map((group) => ({
        ...group,
        files: group.files.filter((file) => unchanged.has(file.path)),
      }))
      .filter((group) => group.files.length),
  };
  return { context, retained, aliases };
};

export const mergeIncrementalGrouping = (
  snapshot: SavedReviewSchema,
  retained: GroupingSchema,
  generated: GroupingSchema,
  aliases: { key: string; title: string }[] = [],
  context?: GroupingSchema,
) => {
  const groups = retained.groups.map((group) => ({
    ...group,
    files: [...group.files],
  }));
  for (const group of generated.groups) {
    const existing = groups.find(
      (candidate) => candidate.title === group.title,
    );
    if (existing) existing.files.push(...group.files);
    else groups.push({ ...group, files: [...group.files] });
  }
  if (aliases.length)
    groups.sort((left, right) => {
      const leftIndex = aliases.findIndex((alias) => alias.key === left.title);
      const rightIndex = aliases.findIndex(
        (alias) => alias.key === right.title,
      );
      return (
        (leftIndex < 0 ? aliases.length : leftIndex) -
        (rightIndex < 0 ? aliases.length : rightIndex)
      );
    });
  for (const group of groups) {
    const original = context?.groups.find(
      (candidate) => candidate.title === group.title,
    );
    if (!original) continue;
    const positions = new Map(
      original.files.map((file, index) => [file.path, index]),
    );
    group.files.sort(
      (left, right) =>
        (positions.get(left.path) ?? original.files.length) -
        (positions.get(right.path) ?? original.files.length),
    );
  }
  return validateGrouping(
    {
      groups: groups.map((group) => ({
        ...group,
        title:
          aliases.find((alias) => alias.key === group.title)?.title ??
          group.title,
      })),
    },
    snapshot,
  );
};
