import { expect, test } from "vitest";
import { analyzeLanguageSources } from "../language-adapters";

test("Python parsing finds real declarations and imports without claiming semantic references", async () => {
  const analysis = await analyzeLanguageSources({
    "app.py":
      "from helpers import value\n# def fake():\ntext = 'def imaginary():'\ndef run(input):\n    return value(input)\n",
    "helpers.py": "def value(input):\n    return input\n",
  });
  expect(analysis.symbols.map((symbol) => symbol.name)).toEqual(
    expect.arrayContaining(["run", "value"]),
  );
  expect(
    analysis.symbols.some((symbol) =>
      ["fake", "imaginary"].includes(symbol.name),
    ),
  ).toBe(false);
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "app.py",
      to: "helpers.py",
      provenance: "syntactic",
    }),
  );
  expect(analysis.capabilities["app.py"]?.level).toBe("parsing");
});

test("Go parsing resolves package candidates and syntax diagnostics independently of unsupported files", async () => {
  const analysis = await analyzeLanguageSources({
    "go.mod": "module example.org/app\n\ngo 1.24\n",
    "main.go":
      'package main\nimport "example.org/app/store"\nfunc Run() { store.Load() }\n',
    "store/store.go": 'package store\nfunc Load() string { return "ok" }\n',
    "broken.py": "def broken(:\n",
    "other.rs": "fn main() {}",
  });
  expect(analysis.symbols).toContainEqual(
    expect.objectContaining({ name: "Run", path: "main.go" }),
  );
  expect(analysis.edges).toContainEqual(
    expect.objectContaining({
      from: "main.go",
      to: "store/store.go",
      provenance: "syntactic",
    }),
  );
  expect(
    analysis.diagnostics.some((diagnostic) => diagnostic.path === "broken.py"),
  ).toBe(true);
  expect(analysis.capabilities["other.rs"]?.level).toBe("text");
});
