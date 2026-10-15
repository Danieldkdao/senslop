import { expect, test } from "vitest";
import { analyzeSources, sourceTools } from "../snapshot-analysis";

test("JS/TS graph resolves aliases, type-only imports, references and cycles from frozen source", async () => {
  const sources = {
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "src/types.ts": "export type Thing = { value: number };",
    "src/a.ts":
      "import type { Thing } from '@/types'; import { b } from './b'; export const a: Thing = { value: b };",
    "src/b.ts": "import { a } from './a'; export const b = 2; console.log(a);",
    "src/a.test.ts": "import { a } from './a'; console.log(a);",
  };
  const analysis = await analyzeSources(sources, ["src/a.ts", "src/b.ts"]);
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "src/a.ts",
      to: "src/types.ts",
      typeOnly: true,
    }),
  );
  expect(
    analysis.cycles.some(
      (cycle) => cycle.includes("src/a.ts") && cycle.includes("src/b.ts"),
    ),
  ).toBe(true);
  expect(analysis.symbols.some((symbol) => symbol.name === "a")).toBe(true);
  const tools = sourceTools({ sources, analysis, limitations: [] });
  expect(tools.dependencies("src/a.ts").dependencies.length).toBe(2);
  expect(tools.references("a").length).toBeGreaterThan(1);
  expect(tools.relatedTests("src/a.ts")).toContain("src/a.test.ts");
  expect(() => tools.read("../secret", 1, 20)).toThrow();
});
test("diagnostics are labeled and unsupported languages are available as text", async () => {
  const sources = {
    "bad.tsx": "const n: number = 'wrong'; export const x = <div/>;",
    "other.py": "def hello(): pass",
  };
  const analysis = await analyzeSources(sources, ["bad.tsx", "other.py"]);
  expect(
    analysis.diagnostics.some((diagnostic) => diagnostic.code === 2322),
  ).toBe(true);
  expect(analysis.limitations.join(" ")).toMatch(/other.py/);
  expect(
    sourceTools({ sources, analysis, limitations: [] }).search("hello")[0]
      ?.path,
  ).toBe("other.py");
});
