import { serverEnv } from "../../data/env/server";
import { createRequire } from "node:module";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import {
  languageSettingsSchema,
  type LanguageSettingsSchema,
} from "@senslop/contracts";
import type { Analysis, SourceMap, SourceAnalysisRequest } from "./types";

const analyses = new Map<string, Promise<Analysis>>();
let queue: Promise<unknown> = Promise.resolve();

const compile = (request: SourceAnalysisRequest): Promise<Analysis> =>
  new Promise((resolve, reject) => {
    const options = { workerData: request };
    let entry: string | URL = join(
      process.cwd(),
      ".analysis/source-analysis-worker.mjs",
    );
    if (serverEnv.NODE_ENV !== "production") {
      const appRoot =
        serverEnv.NODE_ENV === "test"
          ? resolvePath(dirname(fileURLToPath(import.meta.url)), "../../..")
          : process.cwd();
      const loader = createRequire(join(appRoot, "package.json")).resolve(
        "tsx/esm/api",
      );
      const source = join(
        appRoot,
        "src/services/analysis/source-analysis-worker.ts",
      );
      // Development runs the same worker source through tsx; packaged builds use the compiled entry.
      entry = new URL(
        `data:text/javascript,${encodeURIComponent(`import api from ${JSON.stringify(pathToFileURL(loader).href)}; api.register(); await import(${JSON.stringify(pathToFileURL(source).href)});`)}`,
      );
    }
    // Turbopack rewrites dynamic Worker paths into an invalid application-wide loader.
    // The worker entry is compiled separately, so preserve Node's constructor here.
    const worker = Reflect.construct(Worker, [entry, options]) as Worker;
    let settled = false;
    const finish = (error?: Error, analysis?: Analysis) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error);
      else resolve(analysis!);
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Frozen source analysis exceeded its time limit. Retry the review.",
          ),
        ),
      120_000,
    );
    timeout.unref();
    worker.once(
      "message",
      (message: { analysis?: Analysis; error?: string }) => {
        if (message.analysis) finish(undefined, message.analysis);
        else
          finish(
            new Error(
              message.error ?? "Frozen source analysis returned no result.",
            ),
          );
      },
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", () =>
      finish(
        new Error("Frozen source analysis stopped before returning a result."),
      ),
    );
  });

export const analyzeSources = (
  sources: SourceMap,
  changed: string[],
  settings: LanguageSettingsSchema = languageSettingsSchema.parse({}),
): Promise<Analysis> => {
  const request = { sources, changed, settings };
  const key = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  const existing = analyses.get(key);
  if (existing) return existing;
  // Serialize compiler work to bound memory while sharing identical requests across readers.
  const analysis = queue.then(() => compile(request));
  queue = analysis.catch(() => {});
  analyses.set(key, analysis);
  if (analyses.size > 4) analyses.delete(analyses.keys().next().value!);
  void analysis.catch(() => {
    if (analyses.get(key) === analysis) analyses.delete(key);
  });
  return analysis;
};
