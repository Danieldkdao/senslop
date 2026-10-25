import { createHash } from "node:crypto";
import { diffLines } from "diff";
import type {
  PreviewFileSchema,
  ReviewUnitSchema,
  OrganizationSchema,
} from "@senslop/contracts";

export const unitDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);

export const createReviewUnits = (
  files: PreviewFileSchema[],
): ReviewUnitSchema[] =>
  files.flatMap((file) => {
    const units: ReviewUnitSchema[] = [];
    let oldLine = 1;
    let newLine = 1;
    let ranges: ReviewUnitSchema["ranges"] = [];
    const occurrences = new Map<string, number>();
    const append = () => {
      if (!ranges.length) return;
      const fingerprint = unitDigest(
        ranges.map(({ side, code }) => ({ side, code })),
      );
      const occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      const first =
        ranges.find((range) => range.side === "after") ?? ranges[0]!;
      units.push({
        id: unitDigest([file.path, fingerprint, occurrence]),
        path: file.path,
        fingerprint,
        label: `Lines ${first.start}–${first.end}`,
        kind: "text",
        ranges,
        reviewed: false,
        moved: false,
        needsReview: false,
      });
      ranges = [];
    };
    if (!file.binary)
      for (const part of diffLines(file.before ?? "", file.after ?? "")) {
        const count = part.count ?? 0;
        if (!part.added && !part.removed) {
          append();
          oldLine += count;
          newLine += count;
        } else {
          const start = part.removed ? oldLine : newLine;
          ranges.push({
            side: part.removed ? "before" : "after",
            start,
            end: start + count - 1,
            code: part.value.replace(/\n$/, ""),
          });
          if (part.removed) oldLine += count;
          else newLine += count;
        }
      }
    append();
    if (!units.length) {
      const fingerprint = unitDigest([
        file.beforeHash,
        file.afterHash,
        file.status,
        file.oldPath,
        file.diff,
      ]);
      units.push({
        id: unitDigest([file.path, fingerprint]),
        path: file.path,
        fingerprint,
        label: file.binary ? "Binary change" : "File metadata",
        kind: file.binary ? "binary" : "metadata",
        ranges: [],
        reviewed: false,
        moved: false,
        needsReview: false,
      });
    }
    return units;
  });

export const validateOrganization = (organization: OrganizationSchema) => {
  const ids = new Set(organization.units.map((unit) => unit.id));
  const owned = organization.flows.flatMap((flow) => flow.unitIds);
  if (
    ids.size !== organization.units.length ||
    new Set(organization.flows.map((flow) => flow.id)).size !==
      organization.flows.length ||
    owned.length !== ids.size ||
    new Set(owned).size !== ids.size ||
    owned.some((id) => !ids.has(id))
  )
    throw new Error("Each review unit must belong to exactly one flow once.");
  const lines = new Set<string>();
  for (const unit of organization.units)
    for (const range of unit.ranges) {
      if (range.end < range.start)
        throw new Error("Invalid region coordinates.");
      for (let line = range.start; line <= range.end; line++) {
        const key = JSON.stringify([unit.path, range.side, line]);
        if (lines.has(key))
          throw new Error("A changed line can only be owned once.");
        lines.add(key);
      }
    }
  return organization;
};

const retainManualBoundaries = (
  canonical: ReviewUnitSchema[],
  previous: OrganizationSchema,
  preservedIds: Set<string>,
) => {
  const owned = new Set<string>();
  const key = (path: string, side: string, line: number) =>
    JSON.stringify([path, side, line]);
  const retained: ReviewUnitSchema[] = [];
  for (const old of previous.units) {
    if (old.kind !== "text") continue;
    const ranges: ReviewUnitSchema["ranges"] = [];
    let path: string | undefined;
    for (const oldRange of old.ranges) {
      const wanted = oldRange.code.split("\n");
      const candidates: {
        path: string;
        range: ReviewUnitSchema["ranges"][number];
      }[] = [];
      for (const unit of canonical)
        for (const range of unit.ranges) {
          if (range.side !== oldRange.side) continue;
          const lines = range.code.split("\n");
          for (
            let offset = 0;
            offset + wanted.length <= lines.length;
            offset++
          ) {
            if (wanted.every((line, index) => lines[offset + index] === line))
              candidates.push({
                path: unit.path,
                range: {
                  ...oldRange,
                  start: range.start + offset,
                  end: range.start + offset + wanted.length - 1,
                },
              });
          }
        }
      const local = candidates.filter(
        (candidate) => candidate.path === old.path,
      );
      const unambiguous = local.length ? local : candidates;
      if (unambiguous.length !== 1 || (path && path !== unambiguous[0]!.path))
        break;
      const candidate = unambiguous[0]!;
      if (
        Array.from(
          { length: candidate.range.end - candidate.range.start + 1 },
          (_, index) =>
            key(
              candidate.path,
              candidate.range.side,
              candidate.range.start + index,
            ),
        ).some((line) => owned.has(line))
      )
        break;
      path = candidate.path;
      ranges.push(candidate.range);
    }
    if (!path || ranges.length !== old.ranges.length) continue;
    for (const range of ranges)
      for (let line = range.start; line <= range.end; line++)
        owned.add(key(path, range.side, line));
    const first = ranges.find((range) => range.side === "after") ?? ranges[0]!;
    preservedIds.add(old.id);
    retained.push({
      ...old,
      path,
      ranges,
      label: `Lines ${first.start}–${first.end}`,
      fingerprint: unitDigest(ranges.map(({ side, code }) => ({ side, code }))),
      moved:
        old.path !== path ||
        JSON.stringify(old.ranges) !== JSON.stringify(ranges),
    });
  }
  const remaining = canonical.flatMap((unit) => {
    if (!unit.ranges.length) return [unit];
    const ranges = unit.ranges.flatMap((range) => {
      const fragments: ReviewUnitSchema["ranges"] = [];
      const lines = range.code.split("\n");
      let start = 0;
      for (let offset = 0; offset <= lines.length; offset++) {
        if (
          offset !== lines.length &&
          !owned.has(key(unit.path, range.side, range.start + offset))
        )
          continue;
        if (offset > start)
          fragments.push({
            side: range.side,
            start: range.start + start,
            end: range.start + offset - 1,
            code: lines.slice(start, offset).join("\n"),
          });
        start = offset + 1;
      }
      return fragments;
    });
    if (!ranges.length) return [];
    if (JSON.stringify(ranges) === JSON.stringify(unit.ranges)) return [unit];
    const fingerprint = unitDigest(
      ranges.map(({ side, code }) => ({ side, code })),
    );
    const first = ranges.find((range) => range.side === "after") ?? ranges[0]!;
    return [
      {
        ...unit,
        id: unitDigest([unit.path, fingerprint, ranges]),
        fingerprint,
        ranges,
        label: `Lines ${first.start}–${first.end}`,
      },
    ];
  });
  return [...retained, ...remaining];
};

export const reconcileOrganization = (
  units: ReviewUnitSchema[],
  previous?: OrganizationSchema,
): OrganizationSchema => {
  const preservedIds = new Set<string>();
  if (previous?.manual)
    units = retainManualBoundaries(units, previous, preservedIds);
  const oldUnits = previous?.units ?? [];
  const matches = new Map<string, string>();
  const nextUnits = units.map((unit) => {
    const preserved = preservedIds.has(unit.id)
      ? oldUnits.find((old) => old.id === unit.id)
      : undefined;
    const candidates = preserved
      ? [preserved]
      : oldUnits.filter((old) => old.fingerprint === unit.fingerprint);
    const unique =
      candidates.length === 1 &&
      (!!preserved ||
        units.filter((next) => next.fingerprint === unit.fingerprint).length ===
          1);
    const old = unique ? candidates[0] : undefined;
    if (old) matches.set(old.id, unit.id);
    return {
      ...unit,
      reviewed: old?.reviewed ?? false,
      moved:
        !!old &&
        (old.path !== unit.path ||
          JSON.stringify(old.ranges) !== JSON.stringify(unit.ranges)),
      needsReview: candidates.length > 0 && !unique,
    };
  });
  const flows = (previous?.flows ?? [])
    .map((flow) => ({
      ...flow,
      unitIds: flow.unitIds.flatMap((id) => matches.get(id) ?? []),
    }))
    .filter((flow) => flow.unitIds.length);
  const assigned = new Set(flows.flatMap((flow) => flow.unitIds));
  const remaining = nextUnits
    .filter((unit) => !assigned.has(unit.id))
    .map((unit) => unit.id);
  if (remaining.length)
    flows.push({
      id: unitDigest(["remaining", remaining]),
      title: previous ? "New or changed regions" : "Changes",
      rationale: "Read changed regions and their supporting context.",
      unitIds: remaining,
    });
  return validateOrganization({
    version: 0,
    manual: previous?.manual ?? false,
    units: nextUnits,
    flows,
  });
};
