import {
  listSourcePaths,
  readRepository,
  readSourceText,
} from "@senslop/review-core/git";
import type { LocalStore } from "@senslop/review-core/storage";
import type {
  PreviewFileSchema,
  PreviewSourceSchema,
  SavedReviewSchema,
} from "@senslop/contracts";
import type { SourceMap } from "./types";
import { analyzeSources } from "./snapshot-analysis";

type CapturableSnapshot = {
  source: PreviewSourceSchema;
  files: PreviewFileSchema[];
  fingerprint: string | null;
};

export const captureSources = async (
  root: string,
  snapshot: CapturableSnapshot,
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
    const paths = await listSourcePaths(root, ref);
    for (const path of paths.slice(0, 2000)) {
      try {
        const text = await readSourceText(root, path, ref);
        if (text === null) continue;
        bytes += Buffer.byteLength(text);
        if (bytes > 20 * 1024 * 1024) {
          limitations.push(
            "Context reached its 20 MiB bound. Uncaptured files cannot be read by agents; selected changes remain exact.",
          );
          break;
        }
        map[path] = text;
      } catch {
        limitations.push(
          `${path}: context unavailable or exceeds the file limit.`,
        );
      }
    }
    if (paths.length > 2000)
      limitations.push(
        "Context inventory exceeded 2,000 files; the first 2,000 allowed paths were captured.",
      );
  };
  await capture(snapshot.source.head, sources);
  await capture(snapshot.source.base, before);
  for (const file of snapshot.files) {
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

export const freezeContext = async (
  store: LocalStore,
  root: string,
  snapshot: SavedReviewSchema,
) => {
  const existingContext = store.database
    .prepare("SELECT body FROM ai_context WHERE snapshot_id = ?")
    .get(snapshot.id);
  if (existingContext) return;
  let body: object;
  try {
    const captured = await captureSources(root, snapshot);
    const previousReview = snapshot.previousReviewId
      ? store.getReview(root, snapshot.previousReviewId)
      : null;
    for (const file of previousReview?.syncBaseline ??
      previousReview?.files ??
      []) {
      if (
        file.status.startsWith("R") &&
        file.oldPath &&
        file.oldPath !== file.path
      )
        delete captured.before[file.oldPath];
      if (file.after !== null) captured.before[file.path] = file.after;
      else delete captured.before[file.path];
    }
    body = captured;
  } catch (error) {
    body = { error: (error as Error).message };
  }
  if (!store.getReview(root, snapshot.id)) return;
  store.database
    .prepare(
      "INSERT INTO ai_context VALUES (?, ?) ON CONFLICT(snapshot_id) DO NOTHING",
    )
    .run(snapshot.id, JSON.stringify(body));
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
    sources: SourceMap;
    before: SourceMap;
    limitations: string[];
    analysis?: import("./types").Analysis;
    error?: string;
  };
  if (captured.error) throw new Error(captured.error);
  const sources = { ...captured.sources };
  for (const file of snapshot.files)
    if (file.after === null && file.before !== null)
      sources[file.path] = file.before;
  const analysis =
    captured.analysis ??
    (await analyzeSources(
      sources,
      snapshot.files.map((file) => file.path),
    ));
  if (!captured.analysis)
    store.database
      .prepare("UPDATE ai_context SET body = ? WHERE snapshot_id = ?")
      .run(JSON.stringify({ ...captured, analysis }), snapshot.id);
  return { ...captured, analysis };
};
