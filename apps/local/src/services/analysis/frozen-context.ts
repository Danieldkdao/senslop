import { createHash } from "node:crypto";
import { readLanguageSettings } from "./language-settings";
import {
  listSourcePaths,
  readRepository,
  readSourceTexts,
} from "@senslop/review-core/git";
import type { LocalStore } from "@senslop/review-core/storage";
import type {
  PreviewFileSchema,
  PreviewSourceSchema,
  SavedReviewSchema,
} from "@senslop/contracts";
import type { SourceMap } from "./types";
import {
  readProjectPolicy,
  allowsSourcePath,
  sourcePolicyHash,
  WorkflowPolicyError,
} from "@senslop/review-core/policy";
import {
  projectPolicySchema,
  type ProjectPolicySchema,
} from "@senslop/contracts";
import { analyzeSources, snapshotAnalysisVersion } from "./snapshot-analysis";

type CapturableSnapshot = {
  source: PreviewSourceSchema;
  files: PreviewFileSchema[];
  fingerprint: string | null;
};

export const captureSources = async (
  root: string,
  snapshot: CapturableSnapshot,
  policy: ProjectPolicySchema = projectPolicySchema.parse({}),
) => {
  const check = async () => {
    if (
      snapshot.source.kind === "working-tree" &&
      (!snapshot.fingerprint ||
        (await readRepository(root)).fingerprint !== snapshot.fingerprint)
    )
      throw new Error(
        "Repository context changed. Create a fresh snapshot before using AI.",
      );
  };
  await check();
  const sources: SourceMap = {};
  const before: SourceMap = {};
  const limitations: string[] = [];
  let bytes = 0;
  const capture = async (ref: string | null, map: SourceMap) => {
    const paths = (await listSourcePaths(root, ref)).filter((path) =>
      allowsSourcePath(policy, path),
    );
    const captured = await readSourceTexts(
      root,
      paths.slice(0, 2000),
      ref,
      20 * 1024 * 1024 - bytes,
    );
    Object.assign(map, captured.sources);
    bytes += Object.values(captured.sources).reduce(
      (sum, text) => sum + Buffer.byteLength(text),
      0,
    );
    if (captured.limited)
      limitations.push(
        "Context reached its 20 MiB bound. Uncaptured files cannot be read by agents; selected changes remain exact.",
      );
    limitations.push(
      ...captured.unavailable.map(
        (path) => `${path}: context unavailable or exceeds the file limit.`,
      ),
    );
    if (paths.length > 2000)
      limitations.push(
        "Context inventory exceeded 2,000 files; the first 2,000 allowed paths were captured.",
      );
  };
  await capture(snapshot.source.head, sources);
  await capture(snapshot.source.base, before);
  for (const file of snapshot.files) {
    if (
      !allowsSourcePath(policy, file.path) ||
      (file.oldPath && !allowsSourcePath(policy, file.oldPath))
    )
      throw new WorkflowPolicyError(
        "Source policy changed. Capture a new review before requesting analysis.",
      );
    if (file.before !== null) {
      before[file.oldPath ?? file.path] = file.before;
      before[file.path] = file.before;
    }
    if (file.after !== null) sources[file.path] = file.after;
    else delete sources[file.path];
  }
  await check();
  return { sources, before, limitations };
};

const captureContext = async (
  store: LocalStore,
  root: string,
  snapshot: SavedReviewSchema,
) => {
  const existingContext = store.database
    .prepare("SELECT body FROM ai_context WHERE snapshot_id = ?")
    .get(snapshot.id);
  const existing = existingContext
    ? (JSON.parse(String(existingContext.body)) as {
        previousReview?: SavedReviewSchema;
        hash?: string;
        round?: number;
        sources?: SourceMap;
        error?: string;
      })
    : null;
  if (
    existing &&
    (existing.sources || existing.error) &&
    (!existing.hash || existing.hash === snapshot.hash) &&
    (!existing.round || existing.round === snapshot.round)
  )
    return;
  const previousReview =
    existing?.previousReview ??
    (snapshot.previousReviewId && snapshot.previousReviewId !== snapshot.id
      ? store.getReview(root, snapshot.previousReviewId)
      : null);
  let body: object;
  try {
    const policy = readProjectPolicy(store, root);
    const captured = await captureSources(root, snapshot, policy);
    const selected = new Set(
      snapshot.files.flatMap((file) => [file.path, file.oldPath]),
    );
    for (const file of previousReview?.syncBaseline ??
      previousReview?.files ??
      []) {
      if (
        !allowsSourcePath(policy, file.path) ||
        (file.oldPath && !allowsSourcePath(policy, file.oldPath))
      )
        continue;
      if (snapshot.resyncMode === "keep" && selected.has(file.path)) continue;
      if (
        file.status.startsWith("R") &&
        file.oldPath &&
        file.oldPath !== file.path
      )
        delete captured.before[file.oldPath];
      if (file.after !== null) captured.before[file.path] = file.after;
      else delete captured.before[file.path];
    }
    body = {
      ...captured,
      policyHash: sourcePolicyHash(policy),
      hash: snapshot.hash,
      round: snapshot.round,
      previousReview:
        snapshot.resyncMode === "keep" &&
        previousReview &&
        [...previousReview.files, ...(previousReview.syncBaseline ?? [])].every(
          (file) =>
            allowsSourcePath(policy, file.path) &&
            (!file.oldPath || allowsSourcePath(policy, file.oldPath)),
        )
          ? previousReview
          : undefined,
    };
  } catch (error) {
    body = {
      error: (error as Error).message,
      hash: snapshot.hash,
      round: snapshot.round,
      previousReview,
    };
  }
  const currentReview = store.getReview(root, snapshot.id);
  if (
    currentReview?.hash !== snapshot.hash ||
    currentReview.round !== snapshot.round
  )
    return;
  store.database
    .prepare(
      "INSERT INTO ai_context VALUES (?, ?) ON CONFLICT(snapshot_id) DO UPDATE SET body = excluded.body",
    )
    .run(snapshot.id, JSON.stringify(body));
  store.database
    .prepare(
      "UPDATE review_rounds SET context = ? WHERE review_id = ? AND round = ?",
    )
    .run(JSON.stringify(body), snapshot.id, snapshot.round);
};

const captures = new WeakMap<LocalStore, Map<string, Promise<void>>>();

export const freezeContext = (
  store: LocalStore,
  root: string,
  snapshot: SavedReviewSchema,
) => {
  let pending = captures.get(store);
  if (!pending) {
    pending = new Map();
    captures.set(store, pending);
  }
  const key = `${snapshot.id}:${snapshot.hash}:${snapshot.round}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const capture = captureContext(store, root, snapshot).finally(() =>
    pending.delete(key),
  );
  pending.set(key, capture);
  return capture;
};

export const loadContext = async (
  store: LocalStore,
  root: string,
  snapshot: SavedReviewSchema,
) => {
  await freezeContext(store, root, snapshot);
  const existingContext = store.database
    .prepare("SELECT body FROM ai_context WHERE snapshot_id = ?")
    .get(snapshot.id);
  if (!existingContext) throw new Error("Snapshot context is unavailable.");
  const captured = JSON.parse(String(existingContext.body)) as {
    policyHash?: string;
    sources: SourceMap;
    before: SourceMap;
    limitations: string[];
    analysis?: import("./types").Analysis;
    error?: string;
    hash?: string;
    round?: number;
    previousReview?: SavedReviewSchema;
  };
  if (
    (captured.hash && captured.hash !== snapshot.hash) ||
    (captured.round && captured.round !== snapshot.round)
  )
    throw new Error(
      "Snapshot changed during context loading. Reload and retry.",
    );
  if (captured.error) throw new Error(captured.error);
  const policy = readProjectPolicy(store, root);
  const hasPolicy = policy.include.length > 0 || policy.exclude.length > 0;
  if (
    (captured.policyHash && captured.policyHash !== sourcePolicyHash(policy)) ||
    (!captured.policyHash && hasPolicy)
  )
    throw new WorkflowPolicyError(
      "Source policy changed. Capture a new review before requesting analysis.",
    );
  const languageSettings = readLanguageSettings(store, root);
  const settingsHash = createHash("sha256")
    .update(JSON.stringify(languageSettings))
    .digest("hex");
  const currentAnalysis =
    captured.analysis?.version === snapshotAnalysisVersion &&
    captured.analysis.settingsHash === settingsHash;
  const analysis = currentAnalysis
    ? captured.analysis!
    : await analyzeSources(
        captured.sources,
        snapshot.files
          .filter((file) => file.after !== null)
          .map((file) => file.path),
        languageSettings,
      );
  analysis.settingsHash = settingsHash;
  if (
    !currentAnalysis &&
    store.getReview(root, snapshot.id)?.hash === snapshot.hash &&
    store.getReview(root, snapshot.id)?.round === snapshot.round
  )
    store.database
      .prepare("UPDATE ai_context SET body = ? WHERE snapshot_id = ?")
      .run(JSON.stringify({ ...captured, analysis }), snapshot.id);
  return { ...captured, analysis };
};
