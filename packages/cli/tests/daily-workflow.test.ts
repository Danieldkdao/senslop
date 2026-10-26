import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeDailyCommand } from "../src/features/daily-workflow/commands";
import type { WorkspaceClient } from "../src/features/workspace/workspace-client";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("CLI report export creates standalone HTML without overwriting existing files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-report-export-"));
  directories.push(directory);
  const output = join(directory, "report.html");
  const report = {
    id: "d1331fd3-023f-47a8-b154-8aaf37be2acc",
    review: {
      id: "d1331fd3-023f-47a8-b154-8aaf37be2acc",
      hash: "a".repeat(64),
      round: 1,
    },
    title: "<review>",
    createdAt: new Date().toISOString(),
    source: { kind: "working-tree", base: "a".repeat(40), head: null },
    includeSource: false,
    reviewed: 0,
    total: 0,
    sections: [],
    provenance: {},
    remainingWork: "",
  };
  const client = { request: async () => report } as unknown as WorkspaceClient;
  const command = {
    name: "reports export",
    args: [report.id],
    values: { output, format: "html" },
    help: false,
  };
  await executeDailyCommand(client, command);
  expect(await readFile(output, "utf8")).toContain("&lt;review&gt;");
  await expect(executeDailyCommand(client, command)).rejects.toThrow();
});
