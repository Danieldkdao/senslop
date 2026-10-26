import { afterEach, beforeEach, expect, test } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import { LocalStore } from "../../../db/local-store";
import { collectSnapshot, readRepository } from "../../git/repository";
import { CheckRunner } from "../check-runner";
import { WorkflowStore } from "../workflow-store";
import { FixTasks } from "../fix-tasks";
import {
  prepareFixTask,
  captureFixChanges,
  applyFixChanges,
} from "../fix-changes";

let directory: string;
let root: string;
let store: LocalStore;
let review: import("@senslop/contracts").SavedReviewSchema;
let runner: CheckRunner;
let workflow: WorkflowStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "senslop-check-runner-"));
  root = join(directory, "repo");
  await mkdir(root);
  const git = simpleGit(root);
  await git.init();
  await git.addConfig("user.name", "Fixture");
  await git.addConfig("user.email", "fixture@example.test");
  await writeFile(join(root, "value.txt"), "base\n", { mode: 0o755 });
  await git.add(".");
  await git.commit("base");
  await writeFile(join(root, "value.txt"), "bug\n");
  const repository = await readRepository(root);
  store = new LocalStore(join(directory, "reviews.sqlite"));
  review = store.saveReview(
    root,
    {
      ...(await collectSnapshot({
        cwd: root,
        source: { kind: "working-tree" },
      })),
      id: randomUUID(),
      protocolVersion: 1,
    },
    repository.fingerprint,
    false,
    { repositoryState: repository },
  );
  runner = new CheckRunner(store, root, join(directory, "managed"));
  workflow = new WorkflowStore(store, root);
});
afterEach(async () => {
  store?.close();
  await rm(directory, { recursive: true, force: true });
});

test("base and changed checks execute their recorded bytes and source-changing commands cannot pass", async () => {
  const check = runner.create(review, {
    command:
      "node -e \"console.log(require('fs').readFileSync('value.txt','utf8').trim())\"",
    compareWithBase: true,
  });
  expect((await runner.run(check.baselineId!))?.output.trim()).toBe("base");
  expect((await runner.run(check.id))?.output.trim()).toBe("bug");
  expect(runner.get(check.id)?.status).toBe("passed");
  const modifying = runner.create(review, {
    command: "node -e \"require('fs').writeFileSync('value.txt','changed')\"",
  });
  expect(await runner.run(modifying.id)).toMatchObject({
    status: "failed",
    sourceModified: true,
  });
  expect(await readFile(join(root, "value.txt"), "utf8")).toBe("bug\n");
  const unavailable = runner.create(review, {
    command: "senslop-fixture-missing-tool",
  });
  expect(await runner.run(unavailable.id)).toMatchObject({
    status: "blocked",
    exitCode: 127,
  });
});

test("simple commands run with more than 20 MiB of unchanged repository assets", async () => {
  await writeFile(
    join(root, "asset-one.bin"),
    Buffer.alloc(11 * 1024 * 1024, 7),
  );
  await writeFile(
    join(root, "asset-two.bin"),
    Buffer.alloc(11 * 1024 * 1024, 8),
  );
  const git = simpleGit(root);
  await git.add(["asset-one.bin", "asset-two.bin"]);
  await git.commit("assets");
  const repository = await readRepository(root);
  review = store.saveReview(
    root,
    {
      ...(await collectSnapshot({
        cwd: root,
        source: { kind: "working-tree" },
      })),
      id: randomUUID(),
      protocolVersion: 1,
    },
    repository.fingerprint,
    false,
    { repositoryState: repository },
  );
  const check = runner.create(review, { command: "node --version" });
  const result = await runner.run(check.id);
  expect(result).toMatchObject({
    status: "passed",
    exitCode: 0,
    sourceModified: false,
  });
  expect(result?.output.trim()).toBe(process.version);
});

test("canceling and timing out checks persist distinct terminal outcomes", async () => {
  const check = runner.create(review, {
    command: 'node -e "setTimeout(()=>{},30000)"',
  });
  const execution = runner.run(check.id);
  const cancel = setInterval(() => {
    if (runner.get(check.id)?.manifestId) runner.cancel(check.id);
  }, 20);
  try {
    expect((await execution)?.status).toBe("canceled");
  } finally {
    clearInterval(cancel);
  }
  const timeout = runner.create(review, {
    command: 'node -e "setTimeout(()=>{},30000)"',
    timeoutSeconds: 1,
  });
  expect((await runner.run(timeout.id))?.status).toBe("timed-out");
});

test.each(["managed", "current"] as const)(
  "%s task returns text edits beside large unchanged images without resolving findings",
  async (workspaceKind) => {
    await writeFile(join(root, "image.png"), Buffer.alloc(22 * 1024 * 1024));
    await simpleGit(root).add("image.png");
    await simpleGit(root).commit("image");
    const repository = await readRepository(root);
    review = store.saveReview(
      root,
      {
        ...(await collectSnapshot({
          cwd: root,
          source: { kind: "working-tree" },
        })),
        id: randomUUID(),
        protocolVersion: 1,
      },
      repository.fingerprint,
      false,
      { repositoryState: repository },
    );
    const issues = workflow.observe(
      review,
      randomUUID(),
      ["Guard input", "Handle empty"].map((title) => ({
        title,
        severity: "high",
        problem: title,
        path: "value.txt",
        side: "after",
        start: 1,
        end: 1,
        code: "bug",
        fixPrompt: "Fix",
      })),
    );
    const tasks = new FixTasks(store, root);
    let task = tasks.create(review, {
      title: "Fix guard",
      findingIds: [issues[0]!.id],
      workspaceKind,
    });
    task = await prepareFixTask(store, root, task, runner.parent);
    tasks.claim(task.id, "Fixture", review);
    await writeFile(join(task.directory!, "value.txt"), "fixed\n");
    const returned = await captureFixChanges(store, root, task.id, review);
    expect(returned.changes.map((change) => change.path)).toEqual([
      "value.txt",
    ]);
    if (workspaceKind === "managed")
      await applyFixChanges(store, root, task.id, review, ["value.txt"]);
    expect(await readFile(join(root, "value.txt"), "utf8")).toBe("fixed\n");
    expect((await stat(join(root, "value.txt"))).mode & 0o777).toBe(0o755);
    expect(
      workflow
        .findings(review.id)
        .every((finding) => finding.decision === "open"),
    ).toBe(true);
  },
);

test("manual assessment rejects unrelated execution evidence", () => {
  const [issue] = workflow.observe(review, randomUUID(), [
    {
      title: "Bug",
      severity: "high",
      problem: "Bug",
      path: "value.txt",
      side: "after",
      start: 1,
      end: 1,
      code: "bug",
      fixPrompt: "Fix",
    },
  ]);
  expect(() =>
    workflow.assess(
      review.id,
      issue!.id,
      "apparently-fixed",
      "",
      [randomUUID()],
      review,
    ),
  ).toThrow(/check/i);
});

test("declared generated artifacts are recorded without hiding captured-source edits", async () => {
  const check = runner.create(review, {
    command: "node -e \"require('fs').writeFileSync('report.txt','passed')\"",
    artifactPaths: ["report.txt"],
  });
  const result = await runner.run(check.id);
  expect(result).toMatchObject({
    status: "passed",
    artifacts: [{ path: "report.txt", size: 6, error: null }],
  });
});

test("creating and staging an extra source file cannot produce a passing check", async () => {
  const check = runner.create(review, {
    command:
      "node -e \"require('fs').writeFileSync('extra.ts','new source')\" && git add extra.ts",
  });
  expect(await runner.run(check.id)).toMatchObject({
    status: "failed",
    sourceModified: true,
    exitCode: 0,
  });
});

test("an interrupted engine step stops its command and keeps its workspace leased until shutdown", async () => {
  const check = runner.create(review, {
    command: 'node -e "setTimeout(()=>{},1200)"',
  });
  const execution = runner.run(check.id);
  let reuseBlocked = false;
  const interrupt = setInterval(() => {
    const current = runner.get(check.id);
    if (!current?.manifestId) return;
    clearInterval(interrupt);
    runner.save({
      ...current,
      status: "interrupted",
      error: "Engine interrupted",
    });
    try {
      runner.create(review, {
        command: "node --version",
        reuseCheckId: check.id,
      });
    } catch {
      reuseBlocked = true;
    }
  }, 10);
  try {
    expect((await execution)?.status).toBe("interrupted");
    expect(reuseBlocked).toBe(true);
    expect(runner.get(check.id)?.ownerPid).toBeNull();
  } finally {
    clearInterval(interrupt);
  }
});
