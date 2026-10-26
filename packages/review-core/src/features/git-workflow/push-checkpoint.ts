import { findReviewedChange } from "./review-coverage";
import { randomUUID } from "node:crypto";
import {
  savedReviewSchema,
  checkpointPolicySchema,
  outgoingRefSchema,
  workflowSeverities,
  executionManifestSchema,
  checkRunSchema,
  type CheckpointPolicySchema,
  type CheckpointResultSchema,
  type OutgoingRefSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import {
  projectPreferenceKey,
  allowsSourcePath,
  readProjectPolicy,
} from "../workflow/project-policy";
import { WorkflowStore } from "../workflow/workflow-store";
import { gitProcess, gitIdentity, gitBlobDigest } from "./git-process";

export class PushCheckpoint {
  constructor(
    private store: LocalStore,
    private repository: string,
  ) {}

  policy = () => {
    const row = this.store.database
      .prepare("SELECT value FROM preferences WHERE name=?")
      .get(
        projectPreferenceKey(this.store, this.repository, "push_checkpoint"),
      );
    return checkpointPolicySchema.parse(
      row ? JSON.parse(String(row.value)) : {},
    );
  };

  savePolicy = (input: CheckpointPolicySchema) => {
    const policy = checkpointPolicySchema.parse(input);
    this.store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(
        projectPreferenceKey(this.store, this.repository, "push_checkpoint"),
        JSON.stringify(policy),
      );
    return policy;
  };

  outgoing = async (remote: string, branch: string) => {
    if (!remote || remote.startsWith("-") || !branch || branch.startsWith("-"))
      throw new Error("Choose a remote and branch.");
    await gitProcess(this.repository, [
      "check-ref-format",
      `refs/heads/${branch}`,
    ]);
    const localOid = (
      await gitProcess(this.repository, ["rev-parse", "HEAD"])
    ).trim();
    const pushUrls = (
      await gitProcess(this.repository, [
        "remote",
        "get-url",
        "--push",
        "--all",
        remote,
      ])
    )
      .trim()
      .split("\n");
    if (pushUrls.length !== 1 || !pushUrls[0])
      throw new Error(
        "Inspect remotes with multiple push destinations explicitly.",
      );
    const advertised = (
      await gitProcess(this.repository, [
        "ls-remote",
        "--refs",
        "--",
        pushUrls[0],
        `refs/heads/${branch}`,
      ])
    ).trim();
    const remoteOid = advertised
      ? advertised.split(/\s+/)[0]!
      : "0".repeat(localOid.length);
    return this.evaluate(remote, [
      {
        localRef: (
          await gitProcess(this.repository, ["symbolic-ref", "HEAD"])
        ).trim(),
        localOid,
        remoteRef: `refs/heads/${branch}`,
        remoteOid,
      },
    ]);
  };

  evaluate = async (
    remote: string,
    inputs: OutgoingRefSchema[],
  ): Promise<CheckpointResultSchema> => {
    const refs = inputs.map((input) => outgoingRefSchema.parse(input));
    const policy = this.policy();
    const result: CheckpointResultSchema = {
      identity: gitIdentity({
        remote,
        refs: refs.map(({ localOid, remoteRef, remoteOid }) => ({
          localOid,
          remoteRef,
          remoteOid,
        })),
        policy,
      }),
      remote,
      refs,
      enabled: policy.enabled,
      ready: false,
      commits: [],
      issues: [],
      reviewed: 0,
      total: 0,
    };
    const reviews = this.store.database
      .prepare(
        "SELECT body FROM reviews WHERE repository=? UNION ALL SELECT rr.body FROM review_rounds rr JOIN reviews r ON r.id=rr.review_id WHERE r.repository=?",
      )
      .all(this.repository, this.repository)
      .map((row) => savedReviewSchema.parse(JSON.parse(String(row.body))));
    const workflow = new WorkflowStore(this.store, this.repository);
    const sourcePolicy = readProjectPolicy(this.store, this.repository);
    const unresolved = [...new Set(reviews.map((review) => review.id))]
      .flatMap((reviewId) => workflow.findings(reviewId))
      .filter((finding) => ["open", "accepted"].includes(finding.decision));
    const processed = new Set<string>();
    for (const ref of refs) {
      if (
        !(
          ref.localRef.startsWith("refs/heads/") ||
          /^[a-f0-9]{40,64}$/.test(ref.localRef)
        ) ||
        !ref.remoteRef.startsWith("refs/heads/") ||
        /^0+$/.test(ref.localOid)
      ) {
        result.issues.push({
          kind: "unknown",
          message:
            "This checkpoint supports branch updates; inspect tag or deletion operations explicitly.",
        });
        continue;
      }
      try {
        const revision = /^0+$/.test(ref.remoteOid)
          ? [ref.localOid]
          : [`${ref.remoteOid}..${ref.localOid}`];
        const all = (
          await gitProcess(this.repository, [
            "rev-list",
            "--reverse",
            "--max-count=501",
            ...revision,
          ])
        )
          .trim()
          .split("\n")
          .filter(Boolean);
        if (all.length > 500)
          result.issues.push({
            kind: "unknown",
            message:
              "More than 500 outgoing commits require a narrower review or an explicit override.",
          });
        const commits = policy.requireHistory
          ? all.slice(0, 500)
          : [ref.localOid];
        for (const oid of commits) {
          if (processed.has(oid)) continue;
          processed.add(oid);
          result.commits.push({
            oid,
            subject: (
              await gitProcess(this.repository, [
                "show",
                "-s",
                "--format=%s",
                oid,
              ])
            ).trim(),
          });
          const parent = (
            await gitProcess(this.repository, [
              "rev-list",
              "--parents",
              "-n",
              "1",
              oid,
            ])
          )
            .trim()
            .split(" ")[1];
          const compare = policy.requireHistory
            ? parent
            : /^0+$/.test(ref.remoteOid)
              ? (
                  await gitProcess(
                    this.repository,
                    ["hash-object", "-t", "tree", "--stdin"],
                    { input: "" },
                  )
                ).trim()
              : ref.remoteOid;
          const paths = (
            await gitProcess(this.repository, [
              "diff-tree",
              "--no-commit-id",
              "--root",
              "-r",
              "--name-only",
              "-z",
              "--no-renames",
              ...(compare ? [compare, oid] : [oid]),
            ])
          )
            .split("\0")
            .filter(Boolean);
          for (const path of paths) {
            result.total++;
            const afterHash = await gitBlobDigest(this.repository, oid, path);
            const beforeHash = compare
              ? await gitBlobDigest(this.repository, compare, path)
              : null;
            const modes = (
              await gitProcess(this.repository, [
                "diff-tree",
                "--no-commit-id",
                "--root",
                "-r",
                "--raw",
                "--no-renames",
                ...(compare ? [compare, oid] : [oid]),
                "--",
                path,
              ])
            ).trim();
            const mode = /^:(\d+) (\d+)/.exec(modes);
            const modeChanged =
              mode &&
              ((mode[1] !== "000000" &&
                mode[2] !== "000000" &&
                mode[1] !== mode[2]) ||
                !["000000", "100644"].includes(mode[2]!));
            const afterText = await gitProcess(this.repository, [
              "show",
              `${oid}:${path}`,
            ]).catch(() => null);
            const beforeText = compare
              ? await gitProcess(this.repository, [
                  "show",
                  `${compare}:${path}`,
                ]).catch(() => null)
              : null;
            const matched = findReviewedChange(
              this.store,
              reviews,
              path,
              beforeHash,
              afterHash,
              afterText,
              beforeText,
            );
            const limit = workflowSeverities.indexOf(policy.blockingSeverity);
            for (const finding of unresolved) {
              const reviewId = finding.reviewId;
              const observation = finding.observations.find((entry) => {
                if (
                  entry.evidence.path !== path ||
                  workflowSeverities.indexOf(entry.evidence.severity) > limit
                )
                  return false;
                const observed = reviews
                  .find(
                    (review) =>
                      review.id === reviewId &&
                      review.hash === entry.review.hash &&
                      review.round === entry.review.round,
                  )
                  ?.files.find((file) => file.path === path);
                return (
                  observed &&
                  observed.afterHash === afterHash &&
                  (afterHash !== null || observed.beforeHash === beforeHash)
                );
              });
              if (observation)
                result.issues.push({
                  kind: "finding",
                  reviewId,
                  path,
                  commit: oid,
                  message: observation.evidence.title,
                });
            }

            if (
              !matched ||
              !allowsSourcePath(sourcePolicy, path) ||
              modeChanged
            ) {
              if (policy.requireReviewed)
                result.issues.push({
                  kind: "unreviewed",
                  path,
                  commit: oid,
                  message: modeChanged
                    ? "File-mode changes require explicit inspection and override."
                    : "This exact changed version has no completed local review.",
                });
              continue;
            }
            result.reviewed++;
          }
        }
        for (const command of policy.requiredChecks) {
          const checks = this.store.database
            .prepare(
              "SELECT c.body,m.body AS manifest FROM check_runs c JOIN reviews r ON r.id=c.review_id JOIN execution_manifests m ON m.id=json_extract(c.body,'$.manifestId') WHERE r.repository=?",
            )
            .all(this.repository);
          let passing = false;
          for (const row of checks) {
            const check = checkRunSchema.parse(JSON.parse(String(row.body)));
            if (
              check.command !== command ||
              check.status !== "passed" ||
              check.sourceModified ||
              check.sourceSide !== "changed"
            )
              continue;
            const manifest = executionManifestSchema.parse(
              JSON.parse(String(row.manifest)),
            );
            if (
              manifest.review.hash !== check.review.hash ||
              manifest.review.round !== check.review.round
            )
              continue;
            let matches = true;
            for (const file of manifest.files) {
              const digest = await gitBlobDigest(
                this.repository,
                ref.localOid,
                file.path,
              );
              const metadata = (
                await gitProcess(this.repository, [
                  "ls-tree",
                  ref.localOid,
                  "--",
                  file.path,
                ])
              ).split(/\s+/)[0];
              if (
                digest === null ||
                digest !== file.hash ||
                (metadata === "100755") !== !!(file.mode & 0o111)
              ) {
                matches = false;
                break;
              }
            }
            const snapshot = reviews.find(
              (review) =>
                review.id === check.review.id &&
                review.hash === check.review.hash,
            );
            if (!snapshot || !manifest.files.length) matches = false;
            if (snapshot)
              for (const file of snapshot.syncBaseline ?? snapshot.files) {
                const digest = await gitBlobDigest(
                  this.repository,
                  ref.localOid,
                  file.path,
                );
                if (digest !== file.afterHash) {
                  matches = false;
                  break;
                }
              }
            const outgoingPaths = (
              await gitProcess(this.repository, [
                "diff",
                "--name-only",
                "-z",
                manifest.base,
                ref.localOid,
              ])
            )
              .split("\0")
              .filter(Boolean);
            if (
              outgoingPaths.some(
                (path) =>
                  !manifest.files.some((file) => file.path === path) &&
                  !snapshot?.files.some(
                    (file) => file.path === path && file.afterHash === null,
                  ),
              )
            )
              matches = false;
            if (matches) {
              passing = true;
              break;
            }
          }
          if (!passing)
            result.issues.push({
              kind: "check",
              message: `Missing passing check for the exact outgoing inputs: ${command}`,
              commit: ref.localOid,
            });
        }
      } catch {
        result.issues.push({
          kind: "unknown",
          message: "Outgoing Git objects are unavailable; fetch and retry.",
          commit: ref.localOid,
        });
      }
    }
    result.issues = result.issues.filter(
      (issue, index, items) =>
        items.findIndex(
          (other) => JSON.stringify(other) === JSON.stringify(issue),
        ) === index,
    );
    result.ready = result.issues.length === 0;
    return result;
  };

  override = (result: CheckpointResultSchema, reason: string) => {
    if (!reason.trim()) throw new Error("Enter an override reason.");
    const record = {
      id: randomUUID(),
      identity: result.identity,
      remote: result.remote,
      refs: result.refs,
      reason: reason.trim(),
      issues: result.issues,
      createdAt: new Date().toISOString(),
      consumed: false,
    };
    this.store.database
      .prepare("INSERT INTO checkpoint_records VALUES (?,?,?)")
      .run(record.id, this.repository, JSON.stringify(record));
    return record;
  };

  hasOverride = (result: CheckpointResultSchema, consume = false) =>
    this.store.transaction(() => {
      const row = this.store.database
        .prepare(
          "SELECT id,body FROM checkpoint_records WHERE repository=? AND json_extract(body,'$.identity')=? AND json_extract(body,'$.consumed')=0 ORDER BY rowid DESC LIMIT 1",
        )
        .get(this.repository, result.identity);
      if (!row) return false;
      const record = JSON.parse(String(row.body));
      if (Date.now() - Date.parse(record.createdAt) > 5 * 60 * 1000)
        return false;
      if (consume)
        this.store.database
          .prepare("UPDATE checkpoint_records SET body=? WHERE id=?")
          .run(JSON.stringify({ ...record, consumed: true }), String(row.id));
      return true;
    });
}
