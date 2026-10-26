import { parentPort, workerData } from "node:worker_threads";
import { analyzeSources } from "./snapshot-analysis";
import type { SourceAnalysisRequest } from "./types";

const request = workerData as SourceAnalysisRequest;
try {
  const analysis = await analyzeSources(
    request.sources,
    request.changed,
    request.settings,
  );
  parentPort?.postMessage({ analysis });
} catch (error) {
  parentPort?.postMessage({ error: (error as Error).message });
} finally {
  parentPort?.close();
}
