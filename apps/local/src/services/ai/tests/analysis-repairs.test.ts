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

test("review repairs missing coverage and bad evidence without regenerating accepted findings", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [{ path: "c.ts", findings: [] }],
    findings: [{ id: "finding-0", finding: finding("b.ts") }],
    limitations: [],
  }));
  const result = await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [finding("a.ts")] },
        { path: "b.ts", findings: [finding("b.ts", "WRONG")] },
      ],
      limitations: [],
    },
    options(generate),
  );
  expect(result.findings.map((entry) => entry.path)).toEqual(["a.ts", "b.ts"]);
  const prompt = generate.mock.calls[0]![1];
  expect(prompt).toContain("WRONG");
  expect(prompt).toContain("new");
  expect(prompt).toContain("c.ts");
  expect(prompt).toContain("finding-0");
});

test("an unsupported finding can be retracted while other findings in the same file survive", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [],
    findings: [{ id: "finding-0", finding: null }],
    limitations: [],
  }));
  const result = await repairReviewResult(
    {
      files: [
        {
          path: "a.ts",
          findings: [
            finding("a.ts"),
            { ...finding("a.ts", "WRONG"), title: "Unsupported" },
          ],
        },
        { path: "b.ts", findings: [] },
        { path: "c.ts", findings: [] },
      ],
      limitations: [],
    },
    options(generate),
  );
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]!.title).toBe("Bug");
});

test("duplicate review assessments require only the affected file to be reviewed again", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [{ path: "b.ts", findings: [] }],
    findings: [],
    limitations: [],
  }));
  await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [] },
        { path: "b.ts", findings: [] },
        { path: "b.ts", findings: [] },
        { path: "c.ts", findings: [] },
      ],
      limitations: [],
    },
    options(generate),
  );
  const prompt = generate.mock.calls[0]![1];
  expect(prompt).toMatch(/duplicate/i);
  const payload = JSON.parse(
    prompt.slice(
      prompt.indexOf("\nRepair input:\n") + "\nRepair input:\n".length,
    ),
  );
  expect(payload.changes.map((entry: { path: string }) => entry.path)).toEqual([
    "b.ts",
  ]);
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

test("review preserves valid long fix instructions without overflowing the combined prompt contract", async () => {
  const generate = vi.fn();
  const result = await repairReviewResult(
    {
      limitations: [],
      files: ["a.ts", "b.ts", "c.ts"].map((path) => ({
        path,
        findings: [{ ...finding(path), fixPrompt: "x".repeat(9000) }],
      })),
    },
    options(generate),
  );
  expect(result.findings).toHaveLength(3);
  expect(result.findings.every((item) => item.fixPrompt.length === 9000)).toBe(
    true,
  );
  expect(generate).not.toHaveBeenCalled();
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

test("duplicate finding patches remain pending and cannot replace a valid finding", async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      files: [],
      limitations: [],
      findings: [
        { id: "finding-0", finding: null },
        { id: "finding-0", finding: finding("b.ts") },
      ],
    })
    .mockResolvedValueOnce({
      files: [{ path: "a.ts", findings: [] }],
      limitations: [],
      findings: [{ id: "finding-0", finding: finding("b.ts") }],
    });
  const result = await repairReviewResult(
    {
      limitations: [],
      files: [
        { path: "a.ts", findings: [finding("a.ts")] },
        { path: "b.ts", findings: [finding("b.ts", "WRONG")] },
        { path: "c.ts", findings: [] },
      ],
    },
    options(generate),
  );
  expect(generate).toHaveBeenCalledTimes(2);
  expect(result.findings.map((item) => item.path)).toEqual(["a.ts", "b.ts"]);
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

test("evidence repairs receive numbered frozen source around the finding, not just a diff", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [],
    findings: [{ id: "finding-0", finding: finding("b.ts") }],
    limitations: [],
  }));
  await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [] },
        { path: "b.ts", findings: [finding("b.ts", "WRONG")] },
        { path: "c.ts", findings: [] },
      ],
      limitations: [],
    },
    options(generate),
  );
  const prompt = generate.mock.calls[0]![1];
  expect(prompt).toContain(
    '"sourceLines":[{"line":1,"code":"new"},{"line":2,"code":"next"}]',
  );
  expect(prompt).toContain(
    "Do not copy diff markers or line-number prefixes into code",
  );
});

test("unverifiable findings are excluded with a limitation after repair while verified findings survive", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [],
    findings: [{ id: "finding-0", finding: finding("b.ts", "WRONG") }],
    limitations: [],
  }));
  const result = await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [finding("a.ts")] },
        { path: "b.ts", findings: [finding("b.ts", "WRONG")] },
        { path: "c.ts", findings: [] },
      ],
      limitations: [],
    },
    options(generate),
  );
  expect(generate).toHaveBeenCalledTimes(2);
  expect(result.findings.map((finding) => finding.path)).toEqual(["a.ts"]);
  expect(result.limitations.join(" ")).toMatch(/b.ts.*could not be verified/i);
});

test("repair exclusions preserve a full response's limitations instead of exceeding the saved-result cap", async () => {
  const limitations = Array.from(
    { length: 30 },
    (_, index) => `Evidence gap ${index}`,
  );
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [],
    findings: [],
    limitations: [],
  }));
  const result = await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [finding("a.ts")] },
        { path: "b.ts", findings: [finding("b.ts", "WRONG")] },
        { path: "c.ts", findings: [] },
      ],
      limitations,
    },
    options(generate),
  );
  expect(result.findings.map((entry) => entry.path)).toEqual(["a.ts"]);
  expect(result.limitations).toHaveLength(31);
  expect(result.limitations.slice(0, 30)).toEqual(limitations);
  expect(result.limitations[30]).toMatch(/b.ts.*could not be verified/);
});

test("invalid evidence ranges and very long source lines cannot inflate the repair prompt", async () => {
  const generate = vi.fn<AnalysisRepairOptions["generate"]>(async () => ({
    files: [],
    findings: [{ id: "finding-0", finding: null }],
    limitations: [],
  }));
  const repairOptions = options(generate);
  repairOptions.snapshot = {
    ...snapshot,
    files: snapshot.files.map((file) =>
      file.path === "b.ts"
        ? { ...file, after: "x".repeat(200000) + "\n" + "short\n".repeat(1000) }
        : file,
    ),
  };
  await repairReviewResult(
    {
      files: [
        { path: "a.ts", findings: [] },
        {
          path: "b.ts",
          findings: [{ ...finding("b.ts", "WRONG"), end: 1000 }],
        },
        { path: "c.ts", findings: [] },
      ],
      limitations: [],
    },
    repairOptions,
  );
  const prompt = generate.mock.calls[0]![1];
  expect(prompt.length).toBeLessThan(40000);
  expect(prompt).toContain('"lineCount":1002');
  expect(prompt).toContain('"omittedLines":[1]');
});
