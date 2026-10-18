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
  expect(analysis.limitations.join(" ")).toMatch(/text-only review/);
  expect(
    sourceTools({ sources, analysis, limitations: [] }).search("hello")[0]
      ?.path,
  ).toBe("other.py");
});

test("frozen diagnostics resolve nearest nested configs and inherited aliases without mixing project settings", async () => {
  const sources = {
    "tsconfig.base.json": '{"compilerOptions":{"strict":true}}',
    "apps/one/tsconfig.json":
      '{"extends":"../../tsconfig.base.json","compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "apps/two/tsconfig.json":
      '{"extends":"../../tsconfig.base.json","compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "apps/one/src/value.ts": 'export const value: string = "one";',
    "apps/two/src/value.ts": "export const value: number = 2;",
    "apps/one/src/main.ts":
      'import { value } from "@/value"; export const result: string = value; export const identity = (input) => input;',
    "apps/two/src/main.ts":
      'import { value } from "@/value"; export const result: string = value;',
  };
  const analysis = await analyzeSources(sources, [
    "apps/one/src/main.ts",
    "apps/two/src/main.ts",
  ]);
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "apps/one/src/main.ts",
      to: "apps/one/src/value.ts",
      provenance: "compiler-resolved",
    }),
  );
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "apps/two/src/main.ts",
      to: "apps/two/src/value.ts",
      provenance: "compiler-resolved",
    }),
  );
  expect(analysis.diagnostics.some((d) => d.code === 2307)).toBe(false);
  expect(
    analysis.diagnostics.some(
      (d) => d.path === "apps/one/src/main.ts" && d.code === 7006,
    ),
  ).toBe(true);
  expect(
    analysis.diagnostics.some(
      (d) => d.path === "apps/two/src/main.ts" && d.code === 2322,
    ),
  ).toBe(true);
});

test("declared workspace packages resolve captured exports and then their own project aliases", async () => {
  const sources = {
    "apps/local/package.json":
      '{"dependencies":{"@example/shared":"workspace:*"}}',
    "apps/local/tsconfig.json": '{"compilerOptions":{"strict":true}}',
    "packages/shared/package.json":
      '{"name":"@example/shared","exports":{"./value":"./src/value.ts"}}',
    "packages/shared/tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "packages/shared/src/type.ts": "export type Value = string;",
    "packages/shared/src/value.ts":
      'import type { Value } from "@/type"; export const value: Value = "valid";',
    "apps/local/main.ts":
      'import { value } from "@example/shared/value"; export const result: string = value;',
  };
  const analysis = await analyzeSources(sources, ["apps/local/main.ts"]);
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "apps/local/main.ts",
      to: "packages/shared/src/value.ts",
      provenance: "compiler-resolved",
    }),
  );
  expect(analysis.diagnostics.some((d) => d.code === 2307)).toBe(false);
});

test("a captured package is not silently linked when the importer does not declare a workspace dependency", async () => {
  const analysis = await analyzeSources(
    {
      "apps/local/package.json": '{"dependencies":{}}',
      "packages/shared/package.json":
        '{"name":"@example/shared","exports":"./index.ts"}',
      "packages/shared/index.ts": "export const value = 1;",
      "apps/local/main.ts":
        'import { value } from "@example/shared"; export { value };',
    },
    ["apps/local/main.ts"],
  );
  expect(analysis.diagnostics.some((d) => d.code === 2307)).toBe(true);
});

test("workspace conditional exports respect each import's ESM or CommonJS resolution mode", async () => {
  const analysis = await analyzeSources(
    {
      "apps/local/package.json":
        '{"dependencies":{"@example/shared":"workspace:*"}}',
      "apps/local/tsconfig.json":
        '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}',
      "apps/local/main.mts":
        'import { mode } from "@example/shared"; export const result: "import" = mode;',
      "apps/local/main.cts":
        'import { mode } from "@example/shared"; export const result: "require" = mode;',
      "packages/shared/package.json":
        '{"name":"@example/shared","exports":{"import":"./import.mts","require":"./require.cts"}}',
      "packages/shared/import.mts": 'export const mode = "import";',
      "packages/shared/require.cts": 'export const mode = "require";',
    },
    ["apps/local/main.mts", "apps/local/main.cts"],
  );
  for (const [extension, mode] of [
    ["mts", "import"],
    ["cts", "require"],
  ]) {
    expect(analysis.edges).toContainEqual(
      expect.objectContaining({
        from: `apps/local/main.${extension}`,
        to: `packages/shared/${mode}.${extension}`,
        provenance: "compiler-resolved",
      }),
    );
  }
  expect(
    analysis.diagnostics.filter((d) => d.code === 2307 || d.code === 2322),
  ).toEqual([]);
});

test("the same diagnostic imported by multiple projects is reported once", async () => {
  const analysis = await analyzeSources(
    {
      "apps/local/package.json":
        '{"dependencies":{"@example/shared":"workspace:*"}}',
      "apps/local/main.ts":
        'import { value } from "@example/shared"; export { value };',
      "packages/shared/package.json":
        '{"name":"@example/shared","exports":"./index.ts"}',
      "packages/shared/tsconfig.json": "{}",
      "packages/shared/index.ts": 'export const value: number = "wrong";',
    },
    ["apps/local/main.ts", "packages/shared/index.ts"],
  );
  expect(
    analysis.diagnostics.filter(
      (d) => d.path === "packages/shared/index.ts" && d.code === 2322,
    ),
  ).toHaveLength(1);
});
