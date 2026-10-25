import { expect, test } from "vitest";
import { changeImpact } from "../change-impact";
import type { Analysis } from "../types";
import type { ReviewUnitSchema } from "@senslop/contracts";

test("impact links exact captured references, related tests and unresolved dependencies with provenance", () => {
  const unit: ReviewUnitSchema = {
    id: "load",
    path: "store.ts",
    label: "Load",
    fingerprint: "f",
    kind: "text",
    ranges: [
      { side: "after", start: 1, end: 2, code: "export const load = () => 1;" },
    ],
    reviewed: false,
    moved: false,
    needsReview: false,
  };
  const analysis: Analysis = {
    symbols: [
      {
        name: "load",
        path: "store.ts",
        start: 1,
        end: 2,
        kind: "function",
        type: "",
        references: [{ path: "screen.ts", line: 8 }],
        provenance: "compiler-resolved",
      },
    ],
    edges: [
      {
        from: "store.test.ts",
        to: "store.ts",
        specifier: "./store",
        typeOnly: false,
        provenance: "compiler-resolved",
      },
      {
        from: "store.ts",
        to: "missing",
        specifier: "missing",
        typeOnly: false,
        provenance: "unresolved",
      },
    ],
    diagnostics: [],
    cycles: [],
    limitations: [],
  };
  const result = changeImpact([unit], analysis, {
    "store.ts": unit.ranges[0]!.code,
    "screen.ts": "",
    "store.test.ts": "",
  })[0]!;
  expect(result.reasons.join(" ")).toMatch(/export/i);
  expect(result.relationships).toContainEqual(
    expect.objectContaining({
      path: "screen.ts",
      start: 8,
      provenance: "compiler-resolved",
      kind: "reference",
    }),
  );
  expect(result.relationships).toContainEqual(
    expect.objectContaining({ path: "store.test.ts", kind: "test" }),
  );
  expect(result.relationships).toContainEqual(
    expect.objectContaining({ path: "missing", provenance: "unresolved" }),
  );
});

test("deleted declarations retain before-side relationships instead of linking to the after version", () => {
  const unit: ReviewUnitSchema = {
    id: "deleted",
    path: "old.ts",
    label: "Deleted",
    fingerprint: "f",
    kind: "text",
    ranges: [
      { side: "before", start: 1, end: 1, code: "export const old = 1;" },
    ],
    reviewed: false,
    moved: false,
    needsReview: false,
  };
  const analysis: Analysis = {
    symbols: [
      {
        name: "old",
        path: "old.ts",
        start: 1,
        end: 1,
        kind: "const",
        type: "",
        references: [{ path: "caller.ts", line: 3 }],
      },
    ],
    edges: [],
    diagnostics: [],
    cycles: [],
    limitations: [],
  };
  expect(
    changeImpact(
      [unit],
      analysis,
      { "old.ts": unit.ranges[0]!.code },
      "before",
    )[0]?.relationships,
  ).toContainEqual(
    expect.objectContaining({ path: "caller.ts", side: "before" }),
  );
});
