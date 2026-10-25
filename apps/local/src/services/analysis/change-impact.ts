import type {
  ChangeImpactSchema,
  ReviewUnitSchema,
  SourceRelationshipSchema,
  SourceSide,
} from "@senslop/contracts";
import type { Analysis, SourceMap } from "./types";

export const changeImpact = (
  units: ReviewUnitSchema[],
  analysis: Analysis,
  sources: SourceMap,
  side: SourceSide = "after",
): ChangeImpactSchema[] =>
  units.map((unit) => {
    const reasons: string[] = [];
    const relationships: SourceRelationshipSchema[] = [];
    const symbols = analysis.symbols.filter(
      (symbol) =>
        symbol.path === unit.path &&
        unit.ranges.some(
          (range) =>
            range.side === side &&
            range.start <= symbol.end &&
            range.end >= symbol.start,
        ),
    );
    const changed = unit.ranges.map((range) => range.code).join("\n");
    if (
      /\bexport\b/.test(changed) ||
      symbols.some(
        (symbol) => /^[A-Z]/.test(symbol.name) && unit.path.endsWith(".go"),
      )
    )
      reasons.push("Exported interface changed; inspect captured consumers.");
    if (/migrat|schema|\/db\/|\.sql$/i.test(unit.path))
      reasons.push(
        "Persistence change; check compatibility and migration handling.",
      );
    if (
      /permission|authoriz|\bauth\b|security/i.test(unit.path + "\n" + changed)
    )
      reasons.push("Permission or authentication behavior changed.");
    if (
      /(?:^|\/)(?:[^/]*config[^/]*|package\.json|go\.mod|pyproject\.toml|.*lock.*)$/.test(
        unit.path,
      )
    )
      reasons.push("Configuration or dependency inputs changed.");
    for (const symbol of symbols) {
      for (const reference of symbol.references)
        if (
          reference.path !== unit.path ||
          reference.line < symbol.start ||
          reference.line > symbol.end
        )
          relationships.push({
            path: reference.path,
            start: reference.line,
            end: reference.line,
            name: symbol.name,
            kind: "reference",
            provenance: symbol.provenance ?? "compiler-resolved",
            explanation: `Reference to ${symbol.name}`,
          });
      for (const caller of symbol.callers ?? [])
        relationships.push({
          path: caller.path,
          start: caller.line,
          end: caller.line,
          name: symbol.name,
          kind: "caller",
          provenance: symbol.provenance ?? "compiler-resolved",
          explanation: `Calls ${symbol.name}`,
        });
    }
    for (const edge of analysis.edges) {
      if (edge.from !== unit.path && edge.to !== unit.path) continue;
      const dependency = edge.from === unit.path;
      const path = dependency ? edge.to : edge.from;
      relationships.push({
        path,
        start: 1,
        end: 1,
        name: edge.specifier,
        kind: /(?:test|spec)[./]|_test\.go$|(?:^|\/)test_.*\.py$/.test(path)
          ? "test"
          : dependency
            ? "dependency"
            : "dependent",
        provenance: edge.provenance,
        explanation:
          edge.provenance === "unresolved"
            ? `Unresolved import ${edge.specifier}`
            : dependency
              ? `Imported by ${unit.path}`
              : `Imports ${unit.path}`,
      });
    }
    const related = new Set(relationships.map((item) => item.path));
    const basename = unit.path
      .split("/")
      .at(-1)!
      .replace(/\.[^.]+$/, "");
    for (const path of Object.keys(sources))
      if (
        !related.has(path) &&
        /(?:test|spec)[./]|_test\.go$|(?:^|\/)test_.*\.py$/.test(path) &&
        path.split("/").at(-1)!.includes(basename)
      )
        relationships.push({
          path,
          start: 1,
          end: 1,
          name: basename,
          kind: "test",
          provenance: "inferred",
          explanation:
            "Related test candidate by filename; coverage is unverified.",
        });
    if (
      relationships.some(
        (item) => item.kind === "reference" || item.kind === "dependent",
      )
    )
      reasons.push("Captured consumers may be affected.");
    if (reasons.length && !relationships.some((item) => item.kind === "test"))
      reasons.push("No related test was identified in captured context.");
    const unique = [
      ...new Map(
        relationships.map((item) => [
          JSON.stringify([item.path, item.start, item.kind, item.name]),
          item,
        ]),
      ).values(),
    ];
    return {
      unitId: unit.id,
      path: unit.path,
      reasons,
      relationships: unique.map((relationship) => ({ ...relationship, side })),
      limitations: unique.some((item) => item.provenance === "unresolved")
        ? [
            "Unresolved imports do not establish a defect; their supporting context is unavailable.",
          ]
        : [],
    };
  });
