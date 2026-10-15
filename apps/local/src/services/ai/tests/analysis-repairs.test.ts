import { expect, test, vi } from "vitest";
import type { SavedReviewSchema } from "@senslop/contracts";
import { repairGroupingResult, repairReviewResult } from "../analysis-repairs";
import type { AnalysisRepairOptions } from "../types";

const file = (path: string, summary = `Summary for ${path}`) => ({
  path,
  summary,
  related: [],
});
const group = (files: ReturnType<typeof file>[]) => ({
  title: "Flow",
  rationale: "Prerequisites first",
  files,
});
const snapshot = {
  id: "snapshot",
  files: ["a.ts", "b.ts", "c.ts"].map((path) => ({
    path,
    binary: false,
    before: "old",
    after: "new\nnext",
    diff: "@@ -1 +1,2 @@\n-old\n+new\n+next",
  })),
} as SavedReviewSchema;
const options = (generate: AnalysisRepairOptions["generate"]) => ({
  snapshot,
  members: ["a.ts", "b.ts", "c.ts"],
  changes: snapshot.files.map(({ path, diff }) => ({
    path,
    diff,
    binary: false,
    oldPath: null,
  })),
  context: "Frozen dependencies",
  signal: new AbortController().signal,
  generate,
});
const finding = (path: string, code = "new") => ({
  severity: "high",
  title: "Bug",
  problem: "Trigger and consequence",
  rationale: "Evidence",
  path,
  side: "after",
  start: 1,
  end: 1,
  code,
  fixPrompt: "Fix and verify",
});

test("grouping repairs only missing and duplicated files while preserving valid summaries", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    groups: [],
    files: [
      { ...file("b.ts"), groupIndex: 0 },
      { ...file("c.ts"), groupIndex: 0 },
    ],
  }));
  const result = await repairGroupingResult(
    { groups: [group([file("a.ts", "KEEP"), file("b.ts"), file("b.ts")])] },
    options(generate),
  );
  expect(result.groups[0]!.files.map((entry) => entry.path)).toEqual([
    "a.ts",
    "b.ts",
    "c.ts",
  ]);
  expect(result.groups[0]!.files[0]!.summary).toBe("KEEP");
  const prompt = generate.mock.calls[0]![1];
  expect(prompt).toMatch(/duplicate/i);
  expect(prompt).toContain("c.ts");
  expect(prompt).toContain("missing");
  const payload = JSON.parse(
    prompt.slice(
      prompt.indexOf("\nRepair input:\n") + "\nRepair input:\n".length,
    ),
  );
  expect(payload.changes.map((entry: { path: string }) => entry.path)).toEqual([
    "b.ts",
    "c.ts",
  ]);
});

test("grouping metadata repairs do not regenerate valid files", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    groups: [{ index: 0, title: "Fixed title", rationale: "Clear reason" }],
    files: [],
  }));
  const result = await repairGroupingResult(
    {
      groups: [
        {
          ...group(["a.ts", "b.ts", "c.ts"].map((path) => file(path))),
          title: "",
        },
      ],
    },
    options(generate),
  );
  expect(result.groups[0]!.title).toBe("Fixed title");
  expect(result.groups[0]!.files).toHaveLength(3);
  expect(generate.mock.calls[0]![1]).toContain("title");
});

test("unrequested repairs cannot overwrite accepted files and incomplete patches receive specific feedback", async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      groups: [],
      files: [
        { ...file("a.ts", "OVERWRITE"), groupIndex: 0 },
        { ...file("b.ts"), groupIndex: 0 },
      ],
    })
    .mockResolvedValueOnce({
      groups: [],
      files: [{ ...file("c.ts"), groupIndex: 0 }],
    });
  const result = await repairGroupingResult(
    { groups: [group([file("a.ts", "KEEP")])] },
    options(generate),
  );
  expect(result.groups[0]!.files[0]!.summary).toBe("KEEP");
  expect(generate.mock.calls[1]![1]).toContain("c.ts");
  expect(generate.mock.calls[1]![1]).not.toContain("OVERWRITE");
});

test("exhausted targeted repair never returns incomplete coverage", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    groups: [],
    files: [],
  }));
  await expect(
    repairGroupingResult(
      { groups: [group([file("a.ts")])] },
      options(generate),
    ),
  ).rejects.toThrow(/b.ts.*c.ts/);
  expect(generate).toHaveBeenCalledTimes(2);
});

test("ordering repairs regenerate placement only and keep prepared file summaries", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    groups: [],
    files: [
      { path: "b.ts", groupIndex: 0 },
      { path: "c.ts", groupIndex: 0 },
    ],
  }));
  const repairOptions = {
    ...options(generate),
    preparedFiles: ["a.ts", "b.ts", "c.ts"].map((path) =>
      file(path, "PREPARED"),
    ),
  };
  const result = await repairGroupingResult(
    { groups: [group([file("a.ts", "PREPARED")])] },
    repairOptions,
  );
  expect(
    result.groups[0]!.files.every((entry) => entry.summary === "PREPARED"),
  ).toBe(true);
});

test("a malformed grouping patch reports the actual defective field on the next repair", async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      groups: [],
      files: [{ ...file("c.ts"), summary: "", groupIndex: 0 }],
    })
    .mockResolvedValueOnce({
      groups: [],
      files: [{ ...file("c.ts"), groupIndex: 0 }],
    });
  await repairGroupingResult(
    { groups: [group([file("a.ts"), file("b.ts")])] },
    options(generate),
  );
  const payload = JSON.parse(
    generate.mock.calls[1]![1].split("\nRepair input:\n").at(-1)!,
  );
  expect(
    payload.issues.some(
      (issue: { target: string; field: string }) =>
        issue.target === "c.ts" && issue.field === "summary",
    ),
  ).toBe(true);
});

test("canceling during targeted repair never merges the returned patch", async () => {
  const abort = new AbortController();
  const generate = vi.fn(async () => {
    abort.abort(new Error("Canceled"));
    return { groups: [], files: [{ ...file("c.ts"), groupIndex: 0 }] };
  });
  await expect(
    repairGroupingResult(
      { groups: [group([file("a.ts"), file("b.ts")])] },
      { ...options(generate), signal: abort.signal },
    ),
  ).rejects.toThrow("Canceled");
  expect(generate).toHaveBeenCalledTimes(1);
});
