import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../../../db/local-store";
import { collectSnapshot } from "../../git/snapshot";
import { PushCheckpoint } from "../push-checkpoint";

const paths: string[] = [];
afterEach(() =>
  paths
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

test("coverage follows outgoing objects, rejects later edits and records exact overrides", async () => {
  const root = mkdtempSync(join(tmpdir(), "senslop-checkpoint-"));
  paths.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "app.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  const base = git("rev-parse", "HEAD");
  const store = new LocalStore(join(root, ".git/senslop.sqlite"));
  try {
    writeFileSync(join(root, "app.ts"), "export const value = 2;\n");
    const snapshot = await collectSnapshot({
      cwd: root,
      source: { kind: "working-tree" },
    });
    const review = store.saveReview(
      root,
      {
        id: randomUUID(),
        protocolVersion: 1,
        source: snapshot.source,
        files: snapshot.files.map((file) => ({
          ...file,
          additions: file.added,
          deletions: file.deleted,
        })),
        excluded: snapshot.excluded,
      },
      null,
    );
    store.changeReview(root, review.id, {
      action: "complete",
      path: "app.ts",
      complete: true,
    });
    git("add", "app.ts");
    git("commit", "-qm", "reviewed");
    const checkpoint = new PushCheckpoint(store, root);
    checkpoint.savePolicy({
      enabled: true,
      requireReviewed: true,
      requireHistory: true,
      blockingSeverity: "high",
      requiredChecks: [],
    });
    const refs = () => [
      {
        localRef: "refs/heads/main",
        localOid: git("rev-parse", "HEAD"),
        remoteRef: "refs/heads/main",
        remoteOid: base,
      },
    ];
    expect((await checkpoint.evaluate("origin", refs())).ready).toBe(true);
    writeFileSync(join(root, "app.ts"), "export const value = 3;\n");
    git("add", "app.ts");
    git("commit", "-qm", "unreviewed");
    const result = await checkpoint.evaluate("origin", refs());
    expect(result.ready).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "unreviewed")).toBe(
      true,
    );
    checkpoint.override(result, "Emergency fix reviewed externally");
    expect(checkpoint.hasOverride(result)).toBe(true);
    expect(checkpoint.hasOverride({ ...result, identity: "different" })).toBe(
      false,
    );
  } finally {
    store.close();
  }
});

test("a partially staged commit inherits only the exact regions that were reviewed", async () => {
  const { PrecisionStore } = await import("../../precision/precision-store");
  const { GitOperations } = await import("../git-operations");
  const root = mkdtempSync(join(tmpdir(), "senslop-partial-"));
  paths.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const original =
    Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n") + "\n";
  writeFileSync(join(root, "file.txt"), original);
  git("add", ".");
  git("commit", "-qm", "initial");
  const base = git("rev-parse", "HEAD");
  const store = new LocalStore(join(root, ".git/state.sqlite"));
  try {
    writeFileSync(
      join(root, "file.txt"),
      original
        .replace("line 1\n", "changed first\n")
        .replace("line 18\n", "changed last\n"),
    );
    const snapshot = await collectSnapshot({
      cwd: root,
      source: { kind: "working-tree" },
    });
    const review = store.saveReview(
      root,
      { id: randomUUID(), protocolVersion: 1, ...snapshot },
      null,
    );
    const precision = new PrecisionStore(store, root);
    const organization = precision.organization(review);
    organization.units[0]!.reviewed = true;
    precision.save(review, organization);
    const operations = new GitOperations(store, root);
    await operations.act({
      action: "stage",
      path: "file.txt",
      hunk: 0,
      expected: (await operations.status()).identity,
    });
    await operations.act({
      action: "commit",
      subject: "fix: first region",
      body: "",
      expected: (await operations.status()).identity,
    });
    const checkpoint = new PushCheckpoint(store, root);
    const result = await checkpoint.evaluate("origin", [
      {
        localRef: "refs/heads/main",
        localOid: git("rev-parse", "HEAD"),
        remoteRef: "refs/heads/main",
        remoteOid: base,
      },
    ]);
    expect(result.ready).toBe(true);
    expect(result.reviewed).toBe(1);
  } finally {
    store.close();
  }
});

const checkpointFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "senslop-outgoing-"));
  paths.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "app.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  const store = new LocalStore(join(root, ".git/state.sqlite"));
  const checkpoint = new PushCheckpoint(store, root);
  const capture = async () =>
    store.saveReview(
      root,
      {
        id: randomUUID(),
        protocolVersion: 1,
        ...(await collectSnapshot({
          cwd: root,
          source: { kind: "working-tree" },
        })),
      },
      null,
    );
  const refs = (remoteOid = base) => [
    {
      localRef: `refs/heads/${git("branch", "--show-current")}`,
      localOid: git("rev-parse", "HEAD"),
      remoteRef: "refs/heads/main",
      remoteOid,
    },
  ];
  return { root, git, base, store, checkpoint, capture, refs };
};

test.each(["resync", "another review"])(
  "unresolved findings survive %s for identical outgoing file content",
  async (scenario) => {
    const { WorkflowStore } = await import("../../workflow/workflow-store");
    const { root, git, store, checkpoint, capture, refs } = checkpointFixture();
    try {
      writeFileSync(join(root, "app.ts"), "export const value = 2;\n");
      const clean = await capture();
      const review = scenario === "another review" ? await capture() : clean;
      const workflow = new WorkflowStore(store, root);
      const finding = workflow.observe(review, randomUUID(), [
        {
          title: "Wrong value",
          severity: "high",
          problem: "Wrong result",
          path: "app.ts",
          side: "after",
          start: 1,
          end: 1,
          code: "export const value = 2;",
          fixPrompt: "Fix value",
        },
      ])[0]!;
      store.changeReview(root, clean.id, {
        action: "complete",
        path: "app.ts",
        complete: true,
      });
      if (scenario === "resync") {
        writeFileSync(join(root, "other.txt"), "unrelated\n");
        store.saveReview(
          root,
          {
            ...review,
            ...(await collectSnapshot({
              cwd: root,
              source: { kind: "working-tree" },
            })),
          },
          null,
          false,
          {
            resyncMode: "keep",
            previousReviewId: review.id,
            expectedHash: review.hash,
            expectedRound: review.round,
          },
        );
      }
      git("add", "app.ts");
      git("commit", "-qm", "change");
      const result = await checkpoint.evaluate("origin", refs());
      expect(
        result.issues.filter((item) => item.kind === "finding"),
      ).toMatchObject([
        { reviewId: review.id, path: "app.ts", message: "Wrong value" },
      ]);
      workflow.decide(
        review.id,
        finding.id,
        "resolved",
        undefined,
        workflow.requireReview(review.id),
      );
      expect(
        (await checkpoint.evaluate("origin", refs())).issues.filter(
          (item) => item.kind === "finding",
        ),
      ).toEqual([]);
    } finally {
      store.close();
    }
  },
);

test("a new destination branch checks the complete tip tree without history", async () => {
  const { root, git, store, checkpoint, refs } = checkpointFixture();
  try {
    writeFileSync(join(root, "later.txt"), "later\n");
    git("add", ".");
    git("commit", "-qm", "second");
    checkpoint.savePolicy({
      ...checkpoint.policy(),
      enabled: true,
      requireHistory: false,
    });
    const result = await checkpoint.evaluate("origin", refs("0".repeat(40)));
    expect(result.total).toBe(2);
    expect(
      result.issues
        .filter((item) => item.kind === "unreviewed")
        .map((item) => item.path)
        .sort(),
    ).toEqual(["app.ts", "later.txt"]);
  } finally {
    store.close();
  }
});

test("outgoing uses the push destination instead of the fetch destination", async () => {
  const { root, git, store, checkpoint } = checkpointFixture();
  const remote = mkdtempSync(join(tmpdir(), "senslop-push-url-"));
  paths.push(remote);
  try {
    execFileSync("git", ["init", "--bare", "-q", remote]);
    git("remote", "add", "origin", root);
    git("config", "remote.origin.pushurl", remote);
    const branch = git("branch", "--show-current");
    git(
      "update-ref",
      `refs/remotes/origin/${branch}`,
      git("rev-parse", "HEAD"),
    );
    const result = await checkpoint.outgoing("origin", branch);
    expect(result.refs[0]?.remoteOid).toBe("0".repeat(40));
    expect(result.total).toBe(1);
  } finally {
    store.close();
  }
});

test.each(["binary change", "large unchanged asset"])(
  "passing exact-input checks qualify with a %s",
  async (scenario) => {
    const { CheckRunner } = await import("../../workflow/check-runner");
    const { readRepository } = await import("../../git/repository");
    const { root, git, store, checkpoint, refs } = checkpointFixture();
    try {
      if (scenario === "large unchanged asset") {
        writeFileSync(
          join(root, "asset.bin"),
          Buffer.alloc(26 * 1024 * 1024, 7),
        );
        git("add", "asset.bin");
        git("commit", "-qm", "asset");
      } else writeFileSync(join(root, "image.bin"), Buffer.from([0, 1, 2, 3]));
      writeFileSync(join(root, "app.ts"), "export const value = 2;\n");
      const repository = await readRepository(root);
      const review = store.saveReview(
        root,
        {
          id: randomUUID(),
          protocolVersion: 1,
          ...(await collectSnapshot({
            cwd: root,
            source: { kind: "working-tree" },
          })),
        },
        repository.fingerprint,
        false,
        { repositoryState: repository },
      );
      const runner = new CheckRunner(store, root, join(root, ".git/execution"));
      const check = runner.create(review, { command: "node --version" });
      expect((await runner.run(check.id))?.status).toBe("passed");
      git("add", ".");
      git("commit", "-qm", "checked");
      checkpoint.savePolicy({
        ...checkpoint.policy(),
        enabled: true,
        requireReviewed: false,
        requireHistory: false,
        requiredChecks: ["node --version"],
      });
      const result = await checkpoint.evaluate("origin", refs());
      expect(result.issues).toEqual([]);
      expect(result.ready).toBe(true);
    } finally {
      store.close();
    }
  },
);
