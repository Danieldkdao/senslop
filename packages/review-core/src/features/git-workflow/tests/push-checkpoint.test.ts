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
