import type { ReviewUnitSchema, ChangeImpactSchema } from "@senslop/contracts";

export const isRepetitiveUnit = (unit: ReviewUnitSchema) => {
  if (
    /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|go\.sum)|(?:^|\/)(?:generated|__generated__)(?:\/|$)|\.min\.[cm]?js$/.test(
      unit.path,
    )
  )
    return true;
  const lines = unit.ranges
    .flatMap((range) => range.code.split("\n"))
    .filter((line) => line.trim());
  return (
    lines.length > 200 &&
    new Set(lines.map((line) => line.trim())).size / lines.length < 0.1
  );
};

export const orderUnitsByAttention = (
  units: ReviewUnitSchema[],
  impact: ChangeImpactSchema[],
) =>
  [...units].sort(
    (left, right) =>
      (impact.find((item) => item.unitId === right.id)?.reasons.length ?? 0) -
      (impact.find((item) => item.unitId === left.id)?.reasons.length ?? 0),
  );
